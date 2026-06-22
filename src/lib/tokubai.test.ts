import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseStoreList, parseStoreDetail, parseFlyerImages } from "./tokubai";

function fixture(name: string): string {
  return readFileSync(join(__dirname, "__fixtures__", name), "utf-8");
}

const STORE_LIST_PAGE1 = fixture("store-list-page1.html");
const STORE_LIST_EMPTY = fixture("store-list-empty.html");
const STORE_DETAIL = fixture("store-detail.html");
const LEAFLET_DETAIL = fixture("leaflet-detail.html");

describe("parseStoreList", () => {
  it("extracts store id, name, and detail URL for each listed store on a real page", () => {
    const result = parseStoreList(STORE_LIST_PAGE1);
    expect(result.length).toBeGreaterThan(0);

    const kabane = result.find((s) => s.tokubaiStoreId === "259321");
    expect(kabane).toEqual({
      tokubaiStoreId: "259321",
      name: "コモディイイダ 鹿浜店",
      detailUrl: "https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/259321",
    });
  });

  it("does not duplicate a store that appears multiple times on the page", () => {
    const result = parseStoreList(STORE_LIST_PAGE1);
    const ids = result.map((s) => s.tokubaiStoreId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns an empty array for a page with no store cards", () => {
    expect(parseStoreList(STORE_LIST_EMPTY)).toEqual([]);
  });

  it("returns an empty array when given unrelated HTML", () => {
    expect(parseStoreList("<html><body>no stores here</body></html>")).toEqual([]);
  });
});

describe("parseStoreDetail", () => {
  it("extracts name, address, lat/lng, and leaflet detail URLs from a real store page", () => {
    const result = parseStoreDetail(STORE_DETAIL);
    expect(result.name).toBe("コモディイイダ 鹿浜店");
    expect(result.address).toBe("東京都足立区鹿浜7-2-3");
    expect(result.lat).toBeCloseTo(35.7842765, 6);
    expect(result.lng).toBeCloseTo(139.7646489, 6);
    expect(result.leafletUrls).toEqual([
      "https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/259321/leaflets/102270935",
      "https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/259321/leaflets/102270976",
    ]);
  });

  it("returns null lat/lng/address when the map link is missing", () => {
    const result = parseStoreDetail("<html><body><a class='shop_name'>コモディイイダ 鹿浜店</a></body></html>");
    expect(result.lat).toBeNull();
    expect(result.lng).toBeNull();
    expect(result.address).toBeNull();
    expect(result.name).toBe("コモディイイダ 鹿浜店");
  });

  it("returns an empty name when the shop_name element is missing", () => {
    const result = parseStoreDetail("<html><body>nothing here</body></html>");
    expect(result.name).toBe("");
    expect(result.leafletUrls).toEqual([]);
  });
});

describe("parseFlyerImages", () => {
  it("extracts every leaflet's original-resolution image URL and id from a real leaflet page", () => {
    const result = parseFlyerImages(LEAFLET_DETAIL);
    expect(result).toEqual([
      {
        tokubaiImageId: "9416450",
        originalUrl: "https://image.tokubai.co.jp/images/bargain_office_leaflets/o=true/9416450.jpg?1781681155",
      },
      {
        tokubaiImageId: "9416454",
        originalUrl: "https://image.tokubai.co.jp/images/bargain_office_leaflets/o=true/9416454.jpg?1781681242",
      },
    ]);
  });

  it("returns an empty array when there is no view_state data", () => {
    expect(parseFlyerImages("<html><body>no images here</body></html>")).toEqual([]);
  });
});
