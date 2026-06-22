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

const STORE_LINK_RE = /\[(?:[\s\S]*?\n)?(コモディイイダ[^\n\]]*?店)\]\((https:\/\/tokubai\.co\.jp\/[^)]*\/(\d+))\)/g;

export function parseStoreList(markdown: string): StoreListing[] {
  const results: StoreListing[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(STORE_LINK_RE)) {
    const [, name, detailUrl, tokubaiStoreId] = match;
    if (seen.has(tokubaiStoreId)) continue;
    seen.add(tokubaiStoreId);
    results.push({ tokubaiStoreId, name: name.trim(), detailUrl });
  }
  return results;
}

const MAP_LINK_RE = /\[([^\]]+)\]\(https:\/\/www\.google\.com\/maps\/@(-?\d+\.\d+),(-?\d+\.\d+)/;
const LEAFLET_URL_RE = /\((https:\/\/tokubai\.co\.jp\/[^)]*\/leaflets\/\d+)\)/g;
const STORE_NAME_RE = /\[([^\]]*コモディイイダ[^\]]*)\]/;

export function parseStoreDetail(markdown: string): StoreDetail {
  const nameMatch = markdown.match(STORE_NAME_RE);
  const mapMatch = markdown.match(MAP_LINK_RE);

  const leafletUrls: string[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(LEAFLET_URL_RE)) {
    const url = match[1];
    if (seen.has(url)) continue;
    seen.add(url);
    leafletUrls.push(url);
  }

  return {
    name: nameMatch ? nameMatch[1].trim() : "",
    address: mapMatch ? mapMatch[1].trim() : null,
    lat: mapMatch ? parseFloat(mapMatch[2]) : null,
    lng: mapMatch ? parseFloat(mapMatch[3]) : null,
    leafletUrls,
  };
}

const ORIGINAL_IMAGE_RE = /https:\/\/image\.tokubai\.co\.jp\/images\/bargain_office_leaflets\/o=true\/(\d+)\.jpg(\?\d+)?/g;

export function parseFlyerImages(markdown: string): FlyerImage[] {
  const results: FlyerImage[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(ORIGINAL_IMAGE_RE)) {
    const [originalUrl, tokubaiImageId] = match;
    if (seen.has(tokubaiImageId)) continue;
    seen.add(tokubaiImageId);
    results.push({ tokubaiImageId, originalUrl });
  }
  return results;
}
