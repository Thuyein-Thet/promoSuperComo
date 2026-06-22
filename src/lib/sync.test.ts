import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pool, ensureSchema, getAllStoresWithFlyers } from "./db";
import { syncFlyers } from "./sync";

const CHAIN_URL = "https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/leaflet";

function storeListHtml(stores: { id: string; name: string }[]): string {
  const cards = stores
    .map(
      (s) => `
      <div class='shop_leaflet_index_card shop_${s.id}'>
        <a class="shop_leaflet_index_card_header" href="https://tokubai.co.jp/x/${s.id}">
          <div class='name_and_others'><div class='name_text'>${s.name}</div></div>
        </a>
      </div>`,
    )
    .join("\n");
  return `<html><body>${cards}</body></html>`;
}

const EMPTY_LIST_HTML = "<html><body>no stores here</body></html>";

function storeDetailHtml(id: string, name: string, lat: number, lng: number, leafletId: string): string {
  return `<html><body>
    <a class="shop_name">${name}</a>
    <div class='address'><a href="https://www.google.com/maps/@${lat},${lng},18z">東京都足立区鹿浜7-2-3</a></div>
    <a href="https://tokubai.co.jp/x/${id}/leaflets/${leafletId}">チラシ</a>
  </body></html>`;
}

function leafletHtml(images: { id: string }[]): string {
  const entries = images
    .map((img) => `https://image.tokubai.co.jp/images/bargain_office_leaflets/o=true/${img.id}.jpg?1`)
    .join(",");
  return `<html><body><div data-view-state='{"leaflets":[${entries.split(",").map((u) => `{"high_resolution_image_url":"${u}"}`).join(",")}]}'></div></body></html>`;
}

beforeEach(async () => {
  await ensureSchema();
  await pool.query("TRUNCATE flyers, stores RESTART IDENTITY CASCADE");
});

afterEach(async () => {
  await pool.query("TRUNCATE flyers, stores RESTART IDENTITY CASCADE");
});

describe("syncFlyers", () => {
  it("discovers stores, scrapes flyers, and persists them", async () => {
    const http = {
      fetchText: vi.fn(async (url: string) => {
        if (url === CHAIN_URL) return storeListHtml([{ id: "259321", name: "コモディイイダ 鹿浜店" }]);
        if (url === `${CHAIN_URL}?page=2`) return EMPTY_LIST_HTML;
        if (url === "https://tokubai.co.jp/x/259321") return storeDetailHtml("259321", "コモディイイダ 鹿浜店", 35.7842765, 139.7646489, "111");
        if (url === "https://tokubai.co.jp/x/259321/leaflets/111") return leafletHtml([{ id: "9416450" }]);
        throw new Error(`unexpected url ${url}`);
      }),
    };
    const blob = {
      upload: vi.fn(async (_storeId: string, id: string) => `https://blob.example/${id}.jpg`),
      delete: vi.fn(async () => {}),
    };

    const result = await syncFlyers({ http, blob, concurrency: 2 });

    expect(result.storesProcessed).toBe(1);
    expect(result.storesFailed).toEqual([]);
    expect(blob.upload).toHaveBeenCalledWith("259321", "9416450", expect.stringContaining("9416450.jpg"));

    const stores = await getAllStoresWithFlyers();
    expect(stores).toHaveLength(1);
    expect(stores[0].name).toBe("コモディイイダ 鹿浜店");
    expect(stores[0].flyers).toEqual([{ tokubaiImageId: "9416450", blobUrl: "https://blob.example/9416450.jpg" }]);
  });

  it("continues processing other stores when one store's scrape fails", async () => {
    const http = {
      fetchText: vi.fn(async (url: string) => {
        if (url === CHAIN_URL) {
          return storeListHtml([
            { id: "259321", name: "コモディイイダ 鹿浜店" },
            { id: "7530", name: "コモディイイダ 越谷店" },
          ]);
        }
        if (url === `${CHAIN_URL}?page=2`) return EMPTY_LIST_HTML;
        if (url === "https://tokubai.co.jp/x/259321") throw new Error("network error");
        if (url === "https://tokubai.co.jp/x/7530") return storeDetailHtml("7530", "コモディイイダ 越谷店", 35.88, 139.79, "111");
        if (url === "https://tokubai.co.jp/x/7530/leaflets/111") return leafletHtml([{ id: "9416450" }]);
        throw new Error(`unexpected url ${url}`);
      }),
    };
    const blob = { upload: vi.fn(async (_storeId: string, id: string) => `https://blob.example/${id}.jpg`), delete: vi.fn(async () => {}) };

    const result = await syncFlyers({ http, blob, concurrency: 2 });

    expect(result.storesProcessed).toBe(1);
    expect(result.storesFailed).toEqual([{ tokubaiStoreId: "259321", error: "network error" }]);

    const stores = await getAllStoresWithFlyers();
    expect(stores).toHaveLength(1);
    expect(stores[0].tokubaiStoreId).toBe("7530");
  });

  it("deletes blobs and flyer rows for images no longer present", async () => {
    const http = {
      fetchText: vi.fn(async (url: string) => {
        if (url === CHAIN_URL) return storeListHtml([{ id: "259321", name: "コモディイイダ 鹿浜店" }]);
        if (url === `${CHAIN_URL}?page=2`) return EMPTY_LIST_HTML;
        if (url === "https://tokubai.co.jp/x/259321") return storeDetailHtml("259321", "コモディイイダ 鹿浜店", 35.7842765, 139.7646489, "111");
        if (url === "https://tokubai.co.jp/x/259321/leaflets/111") return leafletHtml([{ id: "9416450" }]);
        throw new Error(`unexpected url ${url}`);
      }),
    };
    const blob = { upload: vi.fn(async (_storeId: string, id: string) => `https://blob.example/${id}.jpg`), delete: vi.fn(async () => {}) };

    await syncFlyers({ http, blob, concurrency: 2 });

    http.fetchText = vi.fn(async (url: string) => {
      if (url === CHAIN_URL) return storeListHtml([{ id: "259321", name: "コモディイイダ 鹿浜店" }]);
      if (url === `${CHAIN_URL}?page=2`) return EMPTY_LIST_HTML;
      if (url === "https://tokubai.co.jp/x/259321") return storeDetailHtml("259321", "コモディイイダ 鹿浜店", 35.7842765, 139.7646489, "111");
      if (url === "https://tokubai.co.jp/x/259321/leaflets/111") return leafletHtml([]);
      throw new Error(`unexpected url ${url}`);
    });

    await syncFlyers({ http, blob, concurrency: 2 });

    expect(blob.delete).toHaveBeenCalledWith("https://blob.example/9416450.jpg");
    const stores = await getAllStoresWithFlyers();
    expect(stores[0].flyers).toEqual([]);
  });

  it("walks multiple chain pages until a page yields no new stores", async () => {
    const http = {
      fetchText: vi.fn(async (url: string) => {
        if (url === CHAIN_URL) return storeListHtml([{ id: "259321", name: "コモディイイダ 鹿浜店" }]);
        if (url === `${CHAIN_URL}?page=2`) return storeListHtml([{ id: "7530", name: "コモディイイダ 越谷店" }]);
        if (url === `${CHAIN_URL}?page=3`) return EMPTY_LIST_HTML;
        if (url === "https://tokubai.co.jp/x/259321") return storeDetailHtml("259321", "コモディイイダ 鹿浜店", 35.7842765, 139.7646489, "111");
        if (url === "https://tokubai.co.jp/x/259321/leaflets/111") return leafletHtml([{ id: "9416450" }]);
        if (url === "https://tokubai.co.jp/x/7530") return storeDetailHtml("7530", "コモディイイダ 越谷店", 35.88, 139.79, "222");
        if (url === "https://tokubai.co.jp/x/7530/leaflets/222") return leafletHtml([{ id: "9416450" }]);
        throw new Error(`unexpected url ${url}`);
      }),
    };
    const blob = { upload: vi.fn(async (_storeId: string, id: string) => `https://blob.example/${id}.jpg`), delete: vi.fn(async () => {}) };

    const result = await syncFlyers({ http, blob, concurrency: 2 });

    expect(result.storesProcessed).toBe(2);
    expect(result.storesFailed).toEqual([]);
    expect(http.fetchText).toHaveBeenCalledWith(CHAIN_URL);
    expect(http.fetchText).toHaveBeenCalledWith(`${CHAIN_URL}?page=2`);
    expect(http.fetchText).toHaveBeenCalledWith(`${CHAIN_URL}?page=3`);

    const stores = await getAllStoresWithFlyers();
    expect(stores).toHaveLength(2);
    expect(new Set(stores.map((s) => s.tokubaiStoreId))).toEqual(new Set(["259321", "7530"]));
  });
});
