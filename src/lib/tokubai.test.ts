import { describe, it, expect } from "vitest";
import { parseStoreList, parseStoreDetail, parseFlyerImages } from "./tokubai";

const STORE_LIST_FIXTURE = `
82
店舗

並び替えおすすめ順現在地から近い順

[![](https://image.tokubai.co.jp/images/bargain_office_logos/h=120/525.jpg?1503455839)\\\\
\\\\
コモディイイダ 鹿浜店](https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/259321)

[![](https://image.tokubai.co.jp/images/bargain_office_leaflets/w=674/9416450.jpg?1781681155)\\\\
\\\\
2026年6月20日〜23日まで](https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/259321/leaflets/102270935)
`;

const STORE_DETAIL_FIXTURE = `
## [![](https://image.tokubai.co.jp/images/bargain_office_logos/h=60/525.jpg?1503455839)](https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/259321)[コモディイイダ 鹿浜店](https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/259321)  のチラシ・特売情報

[東京都足立区鹿浜7-2-3](https://www.google.com/maps/@35.7842765,139.7646489,18z?q=35.7842765,139.7646489)

☎ 03-5647-2507

[![](https://image.tokubai.co.jp/images/bargain_office_leaflets/w=552,h=444,mc=true,wo=0,ho=0,cw=552,ch=444,aw=552/9416450.jpg?1781681155)\\\\
\\\\
クリックして\\\\
\\\\
チラシを見る\\\\
\\\\
06月20日更新](https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/259321/leaflets/102270935)

[![](https://image.tokubai.co.jp/images/bargain_office_leaflets/w=552,h=444,mc=true,wo=0,ho=0,cw=552,ch=444,aw=552/9416454.jpg?1781681242)\\\\
\\\\
クリックして\\\\
\\\\
チラシを見る\\\\
\\\\
06月20日更新](https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/259321/leaflets/102270976)
`;

const FLYER_PAGE_FIXTURE = `
[![チラシ画像](https://image.tokubai.co.jp/images/bargain_office_leaflets/w=180,h=135,c=true/9416450.jpg?1781681155)](https://tokubai.co.jp/leaflet)
[拡大して見る](https://image.tokubai.co.jp/images/bargain_office_leaflets/o=true/9416450.jpg?1781681155)
`;

describe("parseStoreList", () => {
  it("extracts store id, name, and detail URL for each listed store", () => {
    const result = parseStoreList(STORE_LIST_FIXTURE);
    expect(result).toEqual([
      {
        tokubaiStoreId: "259321",
        name: "コモディイイダ 鹿浜店",
        detailUrl: "https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/259321",
      },
    ]);
  });

  it("returns an empty array when no stores are present", () => {
    expect(parseStoreList("no stores here")).toEqual([]);
  });
});

describe("parseStoreDetail", () => {
  it("extracts name, address, lat/lng, and leaflet detail URLs", () => {
    const result = parseStoreDetail(STORE_DETAIL_FIXTURE);
    expect(result).toEqual({
      name: "コモディイイダ 鹿浜店",
      address: "東京都足立区鹿浜7-2-3",
      lat: 35.7842765,
      lng: 139.7646489,
      leafletUrls: [
        "https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/259321/leaflets/102270935",
        "https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/259321/leaflets/102270976",
      ],
    });
  });

  it("returns null lat/lng/address when the map link is missing", () => {
    const result = parseStoreDetail("[コモディイイダ 鹿浜店](https://tokubai.co.jp/x/259321)");
    expect(result.lat).toBeNull();
    expect(result.lng).toBeNull();
    expect(result.address).toBeNull();
  });
});

describe("parseFlyerImages", () => {
  it("extracts the original-resolution image URL and its tokubai image id", () => {
    const result = parseFlyerImages(FLYER_PAGE_FIXTURE);
    expect(result).toEqual([
      {
        tokubaiImageId: "9416450",
        originalUrl: "https://image.tokubai.co.jp/images/bargain_office_leaflets/o=true/9416450.jpg?1781681155",
      },
    ]);
  });

  it("returns an empty array when there is no original-resolution image", () => {
    expect(parseFlyerImages("no images here")).toEqual([]);
  });
});
