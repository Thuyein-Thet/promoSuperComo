import * as cheerio from "cheerio";

export interface StoreListing {
  tokubaiStoreId: string;
  name: string;
  detailUrl: string;
}

export interface StoreDetail {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  leafletUrls: string[];
}

export interface FlyerImage {
  tokubaiImageId: string;
  originalUrl: string;
}

const BASE_URL = "https://tokubai.co.jp";
const MAP_LINK_RE = /maps\/@(-?\d+\.\d+),(-?\d+\.\d+)/;
const ORIGINAL_IMAGE_RE = /https:\/\/image\.tokubai\.co\.jp\/images\/bargain_office_leaflets\/o=true\/(\d+)\.jpg(\?\d+)?/g;

export function parseStoreList(html: string): StoreListing[] {
  const $ = cheerio.load(html);
  const results: StoreListing[] = [];
  const seen = new Set<string>();

  $("div[class^='shop_leaflet_index_card ']").each((_, el) => {
    const card = $(el);
    const classAttr = card.attr("class") ?? "";
    const idMatch = classAttr.match(/shop_(\d+)/);
    if (!idMatch) return;
    const tokubaiStoreId = idMatch[1];
    if (seen.has(tokubaiStoreId)) return;

    const name = card.find(".name_text").first().text().trim();
    const href = card.find("a.shop_leaflet_index_card_header").first().attr("href");
    if (!name || !href) return;

    seen.add(tokubaiStoreId);
    results.push({ tokubaiStoreId, name, detailUrl: new URL(href, BASE_URL).toString() });
  });

  return results;
}

export function parseStoreDetail(html: string): StoreDetail {
  const $ = cheerio.load(html);

  const name = $("a.shop_name").first().text().trim();

  const mapLink = $(".address a[href*='maps']").first();
  const mapHref = mapLink.attr("href") ?? "";
  const mapMatch = mapHref.match(MAP_LINK_RE);

  const leafletUrls: string[] = [];
  const seen = new Set<string>();
  $("a[href*='/leaflets/']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const url = new URL(href, BASE_URL).toString();
    if (seen.has(url)) return;
    seen.add(url);
    leafletUrls.push(url);
  });

  return {
    name,
    address: mapMatch ? mapLink.text().trim() : null,
    lat: mapMatch ? parseFloat(mapMatch[1]) : null,
    lng: mapMatch ? parseFloat(mapMatch[2]) : null,
    leafletUrls,
  };
}

export function parseFlyerImages(html: string): FlyerImage[] {
  const results: FlyerImage[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(ORIGINAL_IMAGE_RE)) {
    const [originalUrl, tokubaiImageId] = match;
    if (seen.has(tokubaiImageId)) continue;
    seen.add(tokubaiImageId);
    results.push({ tokubaiImageId, originalUrl });
  }
  return results;
}
