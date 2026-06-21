import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pool, ensureSchema, getAllStoresWithFlyers } from "./db";
import { syncFlyers } from "./sync";

const CHAIN_URL = "https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/leaflet";

const STORE_LIST_MD = `[コモディイイダ 鹿浜店](https://tokubai.co.jp/x/259321)`;
const STORE_DETAIL_MD = `
[コモディイイダ 鹿浜店](https://tokubai.co.jp/x/259321)
[東京都足立区鹿浜7-2-3](https://www.google.com/maps/@35.7842765,139.7646489,18z)
[link](https://tokubai.co.jp/x/259321/leaflets/111)
`;
const LEAFLET_PAGE_MD = `[img](https://image.tokubai.co.jp/images/bargain_office_leaflets/o=true/9416450.jpg?1)`;

beforeEach(async () => {
  await ensureSchema();
  await pool.query("TRUNCATE flyers, stores RESTART IDENTITY CASCADE");
});

afterEach(async () => {
  await pool.query("TRUNCATE flyers, stores RESTART IDENTITY CASCADE");
});

describe("syncFlyers", () => {
  it("discovers stores, scrapes flyers, and persists them", async () => {
    const firecrawl = {
      scrape: vi.fn(async (url: string) => {
        if (url === CHAIN_URL) return { markdown: STORE_LIST_MD };
        if (url === "https://tokubai.co.jp/x/259321") return { markdown: STORE_DETAIL_MD };
        if (url === "https://tokubai.co.jp/x/259321/leaflets/111") return { markdown: LEAFLET_PAGE_MD };
        throw new Error(`unexpected url ${url}`);
      }),
    };
    const blob = {
      upload: vi.fn(async (id: string) => `https://blob.example/${id}.jpg`),
      delete: vi.fn(async () => {}),
    };

    const result = await syncFlyers({ firecrawl, blob, concurrency: 2 });

    expect(result.storesProcessed).toBe(1);
    expect(result.storesFailed).toEqual([]);
    expect(blob.upload).toHaveBeenCalledWith("9416450", expect.stringContaining("9416450.jpg"));

    const stores = await getAllStoresWithFlyers();
    expect(stores).toHaveLength(1);
    expect(stores[0].name).toBe("コモディイイダ 鹿浜店");
    expect(stores[0].flyers).toEqual([{ tokubaiImageId: "9416450", blobUrl: "https://blob.example/9416450.jpg" }]);
  });

  it("continues processing other stores when one store's scrape fails", async () => {
    const twoStoreListMd = `
[コモディイイダ 鹿浜店](https://tokubai.co.jp/x/259321)
[コモディイイダ 越谷店](https://tokubai.co.jp/x/7530)
`;
    const firecrawl = {
      scrape: vi.fn(async (url: string) => {
        if (url === CHAIN_URL) return { markdown: twoStoreListMd };
        if (url === "https://tokubai.co.jp/x/259321") throw new Error("network error");
        if (url === "https://tokubai.co.jp/x/7530") return { markdown: STORE_DETAIL_MD.replace(/259321/g, "7530") };
        if (url === "https://tokubai.co.jp/x/7530/leaflets/111") return { markdown: LEAFLET_PAGE_MD };
        throw new Error(`unexpected url ${url}`);
      }),
    };
    const blob = { upload: vi.fn(async (id: string) => `https://blob.example/${id}.jpg`), delete: vi.fn(async () => {}) };

    const result = await syncFlyers({ firecrawl, blob, concurrency: 2 });

    expect(result.storesProcessed).toBe(1);
    expect(result.storesFailed).toEqual([{ tokubaiStoreId: "259321", error: "network error" }]);

    const stores = await getAllStoresWithFlyers();
    expect(stores).toHaveLength(1);
    expect(stores[0].tokubaiStoreId).toBe("7530");
  });

  it("deletes blobs and flyer rows for images no longer present", async () => {
    const firecrawl = {
      scrape: vi.fn(async (url: string) => {
        if (url === CHAIN_URL) return { markdown: STORE_LIST_MD };
        if (url === "https://tokubai.co.jp/x/259321") return { markdown: STORE_DETAIL_MD };
        if (url === "https://tokubai.co.jp/x/259321/leaflets/111") return { markdown: LEAFLET_PAGE_MD };
        throw new Error(`unexpected url ${url}`);
      }),
    };
    const blob = { upload: vi.fn(async (id: string) => `https://blob.example/${id}.jpg`), delete: vi.fn(async () => {}) };

    await syncFlyers({ firecrawl, blob, concurrency: 2 });

    const emptyLeafletMd = `no images today`;
    firecrawl.scrape = vi.fn(async (url: string) => {
      if (url === CHAIN_URL) return { markdown: STORE_LIST_MD };
      if (url === "https://tokubai.co.jp/x/259321") return { markdown: STORE_DETAIL_MD };
      if (url === "https://tokubai.co.jp/x/259321/leaflets/111") return { markdown: emptyLeafletMd };
      throw new Error(`unexpected url ${url}`);
    });

    await syncFlyers({ firecrawl, blob, concurrency: 2 });

    expect(blob.delete).toHaveBeenCalledWith("https://blob.example/9416450.jpg");
    const stores = await getAllStoresWithFlyers();
    expect(stores[0].flyers).toEqual([]);
  });
});
