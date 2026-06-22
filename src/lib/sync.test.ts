import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pool, ensureSchema, getAllStoresWithFlyers } from "./db";
import { syncFlyers, rateLimited } from "./sync";

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
        if (url === `${CHAIN_URL}?page=2`) return { markdown: "no more stores" };
        if (url === "https://tokubai.co.jp/x/259321") return { markdown: STORE_DETAIL_MD };
        if (url === "https://tokubai.co.jp/x/259321/leaflets/111") return { markdown: LEAFLET_PAGE_MD };
        throw new Error(`unexpected url ${url}`);
      }),
    };
    const blob = {
      upload: vi.fn(async (_storeId: string, id: string) => `https://blob.example/${id}.jpg`),
      delete: vi.fn(async () => {}),
    };

    const result = await syncFlyers({ firecrawl, blob, concurrency: 2, requestsPerMinute: Infinity });

    expect(result.storesProcessed).toBe(1);
    expect(result.storesFailed).toEqual([]);
    expect(blob.upload).toHaveBeenCalledWith("259321", "9416450", expect.stringContaining("9416450.jpg"));

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
        if (url === `${CHAIN_URL}?page=2`) return { markdown: "no more stores" };
        if (url === "https://tokubai.co.jp/x/259321") throw new Error("network error");
        if (url === "https://tokubai.co.jp/x/7530") return { markdown: STORE_DETAIL_MD.replace(/259321/g, "7530") };
        if (url === "https://tokubai.co.jp/x/7530/leaflets/111") return { markdown: LEAFLET_PAGE_MD };
        throw new Error(`unexpected url ${url}`);
      }),
    };
    const blob = { upload: vi.fn(async (_storeId: string, id: string) => `https://blob.example/${id}.jpg`), delete: vi.fn(async () => {}) };

    const result = await syncFlyers({ firecrawl, blob, concurrency: 2, requestsPerMinute: Infinity });

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
        if (url === `${CHAIN_URL}?page=2`) return { markdown: "no more stores" };
        if (url === "https://tokubai.co.jp/x/259321") return { markdown: STORE_DETAIL_MD };
        if (url === "https://tokubai.co.jp/x/259321/leaflets/111") return { markdown: LEAFLET_PAGE_MD };
        throw new Error(`unexpected url ${url}`);
      }),
    };
    const blob = { upload: vi.fn(async (_storeId: string, id: string) => `https://blob.example/${id}.jpg`), delete: vi.fn(async () => {}) };

    await syncFlyers({ firecrawl, blob, concurrency: 2, requestsPerMinute: Infinity });

    const emptyLeafletMd = `no images today`;
    firecrawl.scrape = vi.fn(async (url: string) => {
      if (url === CHAIN_URL) return { markdown: STORE_LIST_MD };
      if (url === `${CHAIN_URL}?page=2`) return { markdown: "no more stores" };
      if (url === "https://tokubai.co.jp/x/259321") return { markdown: STORE_DETAIL_MD };
      if (url === "https://tokubai.co.jp/x/259321/leaflets/111") return { markdown: emptyLeafletMd };
      throw new Error(`unexpected url ${url}`);
    });

    await syncFlyers({ firecrawl, blob, concurrency: 2, requestsPerMinute: Infinity });

    expect(blob.delete).toHaveBeenCalledWith("https://blob.example/9416450.jpg");
    const stores = await getAllStoresWithFlyers();
    expect(stores[0].flyers).toEqual([]);
  });

  it("walks multiple chain pages until a page yields no new stores", async () => {
    const page1Md = `[コモディイイダ 鹿浜店](https://tokubai.co.jp/x/259321)`;
    const page2Md = `[コモディイイダ 越谷店](https://tokubai.co.jp/x/7530)`;
    const page3Md = `no more stores`;

    const firecrawl = {
      scrape: vi.fn(async (url: string) => {
        if (url === CHAIN_URL) return { markdown: page1Md };
        if (url === `${CHAIN_URL}?page=2`) return { markdown: page2Md };
        if (url === `${CHAIN_URL}?page=3`) return { markdown: page3Md };
        if (url === "https://tokubai.co.jp/x/259321") return { markdown: STORE_DETAIL_MD };
        if (url === "https://tokubai.co.jp/x/259321/leaflets/111") return { markdown: LEAFLET_PAGE_MD };
        if (url === "https://tokubai.co.jp/x/7530") return { markdown: STORE_DETAIL_MD.replace(/259321/g, "7530") };
        if (url === "https://tokubai.co.jp/x/7530/leaflets/111") return { markdown: LEAFLET_PAGE_MD };
        throw new Error(`unexpected url ${url}`);
      }),
    };
    const blob = { upload: vi.fn(async (_storeId: string, id: string) => `https://blob.example/${id}.jpg`), delete: vi.fn(async () => {}) };

    const result = await syncFlyers({ firecrawl, blob, concurrency: 2, requestsPerMinute: Infinity });

    expect(result.storesProcessed).toBe(2);
    expect(result.storesFailed).toEqual([]);
    expect(firecrawl.scrape).toHaveBeenCalledWith(CHAIN_URL);
    expect(firecrawl.scrape).toHaveBeenCalledWith(`${CHAIN_URL}?page=2`);
    expect(firecrawl.scrape).toHaveBeenCalledWith(`${CHAIN_URL}?page=3`);

    const stores = await getAllStoresWithFlyers();
    expect(stores).toHaveLength(2);
    expect(new Set(stores.map((s) => s.tokubaiStoreId))).toEqual(new Set(["259321", "7530"]));
  });

});

describe("rateLimited", () => {
  it("returns the client unchanged when requestsPerMinute is not finite", () => {
    const client = { scrape: vi.fn(async () => ({ markdown: "" })) };
    expect(rateLimited(client, Infinity)).toBe(client);
  });

  it("lets the first call through immediately, with no delay", async () => {
    vi.useFakeTimers();
    try {
      const client = { scrape: vi.fn(async (url: string) => ({ markdown: url })) };
      const limited = rateLimited(client, 60);

      const promise = limited.scrape("https://example.com/a");
      await vi.advanceTimersByTimeAsync(0);

      expect(client.scrape).toHaveBeenCalledTimes(1);
      await expect(promise).resolves.toEqual({ markdown: "https://example.com/a" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("delays a second call until the minimum interval has elapsed", async () => {
    vi.useFakeTimers();
    try {
      const client = { scrape: vi.fn(async (url: string) => ({ markdown: url })) };
      const limited = rateLimited(client, 60); // one request every 1000ms

      const first = limited.scrape("https://example.com/a");
      await vi.advanceTimersByTimeAsync(0);
      expect(client.scrape).toHaveBeenCalledTimes(1);

      const second = limited.scrape("https://example.com/b");
      await vi.advanceTimersByTimeAsync(0);
      expect(client.scrape).toHaveBeenCalledTimes(1); // still waiting

      await vi.advanceTimersByTimeAsync(999);
      expect(client.scrape).toHaveBeenCalledTimes(1); // not yet — one ms short

      await vi.advanceTimersByTimeAsync(1);
      expect(client.scrape).toHaveBeenCalledTimes(2); // the 1000ms interval has elapsed

      await Promise.all([first, second]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not delay calls that are already spaced far enough apart", async () => {
    vi.useFakeTimers();
    try {
      const client = { scrape: vi.fn(async (url: string) => ({ markdown: url })) };
      const limited = rateLimited(client, 60); // one request every 1000ms

      await limited.scrape("https://example.com/a");
      await vi.advanceTimersByTimeAsync(5000); // plenty of real spacing

      const before = Date.now();
      const promise = limited.scrape("https://example.com/b");
      await vi.advanceTimersByTimeAsync(0);

      expect(client.scrape).toHaveBeenCalledTimes(2);
      await promise;
      expect(Date.now()).toBe(before); // resolved without waiting
    } finally {
      vi.useRealTimers();
    }
  });
});
