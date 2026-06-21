import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { pool, ensureSchema } from "./db";
import {
  upsertStore,
  getFlyerImageIdsForStore,
  upsertFlyer,
  deleteFlyersNotIn,
  getAllStoresWithFlyers,
} from "./db";

beforeEach(async () => {
  await ensureSchema();
  await pool.query("TRUNCATE flyers, stores RESTART IDENTITY CASCADE");
});

afterAll(async () => {
  await pool.query("TRUNCATE flyers, stores RESTART IDENTITY CASCADE");
  await pool.end();
});

describe("upsertStore", () => {
  it("inserts a new store", async () => {
    const store = await upsertStore({
      tokubaiStoreId: "259321",
      name: "コモディイイダ 鹿浜店",
      address: "東京都足立区鹿浜7-2-3",
      lat: 35.7842765,
      lng: 139.7646489,
    });
    expect(store.tokubaiStoreId).toBe("259321");
    expect(store.name).toBe("コモディイイダ 鹿浜店");
  });

  it("updates an existing store with the same tokubaiStoreId instead of duplicating", async () => {
    await upsertStore({ tokubaiStoreId: "259321", name: "Old Name", address: null, lat: null, lng: null });
    const updated = await upsertStore({ tokubaiStoreId: "259321", name: "New Name", address: null, lat: null, lng: null });
    expect(updated.name).toBe("New Name");

    const all = await getAllStoresWithFlyers();
    expect(all).toHaveLength(1);
  });
});

describe("flyer sync", () => {
  it("adds new flyers and deletes ones no longer present", async () => {
    const store = await upsertStore({ tokubaiStoreId: "259321", name: "Kabane", address: null, lat: null, lng: null });

    await upsertFlyer({ storeId: store.id, tokubaiImageId: "111", blobUrl: "https://blob/111.jpg" });
    await upsertFlyer({ storeId: store.id, tokubaiImageId: "222", blobUrl: "https://blob/222.jpg" });

    let ids = await getFlyerImageIdsForStore(store.id);
    expect(new Set(ids)).toEqual(new Set(["111", "222"]));

    const deleted = await deleteFlyersNotIn(store.id, ["222", "333"]);
    expect(deleted).toHaveLength(1);
    expect(deleted[0].tokubaiImageId).toBe("111");

    await upsertFlyer({ storeId: store.id, tokubaiImageId: "333", blobUrl: "https://blob/333.jpg" });

    ids = await getFlyerImageIdsForStore(store.id);
    expect(new Set(ids)).toEqual(new Set(["222", "333"]));
  });

  it("getAllStoresWithFlyers nests each store's current flyers", async () => {
    const store = await upsertStore({ tokubaiStoreId: "259321", name: "Kabane", address: "Addr", lat: 1, lng: 2 });
    await upsertFlyer({ storeId: store.id, tokubaiImageId: "111", blobUrl: "https://blob/111.jpg" });

    const all = await getAllStoresWithFlyers();
    expect(all).toEqual([
      {
        id: store.id,
        tokubaiStoreId: "259321",
        name: "Kabane",
        address: "Addr",
        lat: 1,
        lng: 2,
        flyers: [{ tokubaiImageId: "111", blobUrl: "https://blob/111.jpg" }],
      },
    ]);
  });
});
