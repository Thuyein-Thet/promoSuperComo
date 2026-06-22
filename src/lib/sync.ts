import { parseStoreList, parseStoreDetail, parseFlyerImages } from "./tokubai";
import { upsertStore, getFlyerImageIdsForStore, upsertFlyer, deleteFlyersNotIn } from "./db";

export interface FirecrawlClient {
  scrape(url: string): Promise<{ markdown: string }>;
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

async function discoverAllStores(firecrawl: FirecrawlClient): Promise<ReturnType<typeof parseStoreList>> {
  const allStores: ReturnType<typeof parseStoreList> = [];
  const seen = new Set<string>();

  for (let page = 1; ; page++) {
    const pageUrl = page === 1 ? CHAIN_LEAFLET_URL : `${CHAIN_LEAFLET_URL}?page=${page}`;
    const chainPage = await firecrawl.scrape(pageUrl);
    const pageStores = parseStoreList(chainPage.markdown);

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
  deps: { firecrawl: FirecrawlClient; blob: BlobClient },
): Promise<void> {
  const detailPage = await deps.firecrawl.scrape(detailUrl);
  const detail = parseStoreDetail(detailPage.markdown);

  const store = await upsertStore({
    tokubaiStoreId,
    name: detail.name,
    address: detail.address,
    lat: detail.lat,
    lng: detail.lng,
  });

  const imagesByUrl = new Map<string, ReturnType<typeof parseFlyerImages>>();
  const currentImageIds = new Set<string>();
  for (const leafletUrl of detail.leafletUrls) {
    const leafletPage = await deps.firecrawl.scrape(leafletUrl);
    const images = parseFlyerImages(leafletPage.markdown);
    imagesByUrl.set(leafletUrl, images);
    for (const image of images) {
      currentImageIds.add(image.tokubaiImageId);
    }
  }

  const existingImageIds = new Set(await getFlyerImageIdsForStore(store.id));
  const newImageIds = [...currentImageIds].filter((id) => !existingImageIds.has(id));

  for (const images of imagesByUrl.values()) {
    for (const image of images) {
      if (!newImageIds.includes(image.tokubaiImageId)) continue;
      const blobUrl = await deps.blob.upload(tokubaiStoreId, image.tokubaiImageId, image.originalUrl);
      await upsertFlyer({ storeId: store.id, tokubaiImageId: image.tokubaiImageId, blobUrl });
    }
  }

  const deleted = await deleteFlyersNotIn(store.id, [...currentImageIds]);
  for (const flyer of deleted) {
    await deps.blob.delete(flyer.blobUrl);
  }
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
  firecrawl: FirecrawlClient;
  blob: BlobClient;
  concurrency?: number;
}): Promise<SyncResult> {
  const stores = await discoverAllStores(deps.firecrawl);

  const result: SyncResult = { storesProcessed: 0, storesFailed: [] };

  await runBatched(stores, deps.concurrency ?? 8, async (store) => {
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
