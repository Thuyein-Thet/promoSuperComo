import { parseStoreList, parseStoreDetail, parseFlyerImages } from "./tokubai";
import { upsertStore, getFlyerImageIdsForStore, upsertFlyer, deleteFlyersNotIn } from "./db";

export interface HttpClient {
  fetchText(url: string): Promise<string>;
}

export interface BlobClient {
  upload(tokubaiStoreId: string, tokubaiImageId: string, sourceUrl: string): Promise<string>;
  delete(blobUrl: string): Promise<void>;
}

export interface SyncResult {
  storesProcessed: number;
  storesFailed: { tokubaiStoreId: string; error: string }[];
}

const CHAIN_LEAFLET_URL = "https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/leaflet";

async function discoverAllStores(http: HttpClient): Promise<ReturnType<typeof parseStoreList>> {
  const allStores: ReturnType<typeof parseStoreList> = [];
  const seen = new Set<string>();

  for (let page = 1; ; page++) {
    const pageUrl = page === 1 ? CHAIN_LEAFLET_URL : `${CHAIN_LEAFLET_URL}?page=${page}`;
    const html = await http.fetchText(pageUrl);
    const pageStores = parseStoreList(html);

    const newStores = pageStores.filter((store) => !seen.has(store.tokubaiStoreId));
    if (newStores.length === 0) break;

    for (const store of newStores) {
      seen.add(store.tokubaiStoreId);
      allStores.push(store);
    }
  }

  return allStores;
}

async function processStore(
  tokubaiStoreId: string,
  detailUrl: string,
  deps: { http: HttpClient; blob: BlobClient },
): Promise<void> {
  const detailHtml = await deps.http.fetchText(detailUrl);
  const detail = parseStoreDetail(detailHtml);

  const store = await upsertStore({
    tokubaiStoreId,
    name: detail.name,
    address: detail.address,
    lat: detail.lat,
    lng: detail.lng,
  });

  // Any one leaflet page lists every currently-active leaflet for the store
  // (confirmed: the page's embedded view_state JSON includes all of them),
  // so we only need to fetch the first leaflet URL, not every one.
  const currentImages =
    detail.leafletUrls.length > 0 ? parseFlyerImages(await deps.http.fetchText(detail.leafletUrls[0])) : [];
  const currentImageIds = new Set(currentImages.map((image) => image.tokubaiImageId));

  const existingImageIds = new Set(await getFlyerImageIdsForStore(store.id));
  const newImages = currentImages.filter((image) => !existingImageIds.has(image.tokubaiImageId));

  let uploadError: unknown;
  for (const image of newImages) {
    try {
      const blobUrl = await deps.blob.upload(tokubaiStoreId, image.tokubaiImageId, image.originalUrl);
      await upsertFlyer({ storeId: store.id, tokubaiImageId: image.tokubaiImageId, blobUrl });
    } catch (err) {
      uploadError = err;
      break;
    }
  }

  const deleted = await deleteFlyersNotIn(store.id, [...currentImageIds]);
  for (const flyer of deleted) {
    await deps.blob.delete(flyer.blobUrl);
  }

  if (uploadError) throw uploadError;
}

async function runBatched<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

export async function syncFlyers(deps: {
  http: HttpClient;
  blob: BlobClient;
  concurrency?: number;
}): Promise<SyncResult> {
  const stores = await discoverAllStores(deps.http);

  const result: SyncResult = { storesProcessed: 0, storesFailed: [] };

  await runBatched(stores, deps.concurrency ?? 5, async (store) => {
    try {
      await processStore(store.tokubaiStoreId, store.detailUrl, deps);
      result.storesProcessed++;
    } catch (err) {
      result.storesFailed.push({
        tokubaiStoreId: store.tokubaiStoreId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return result;
}
