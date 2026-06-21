# Comodi Iida Flyer Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js app, deployed on Vercel, that daily re-scrapes all Comodi Iida store flyers from Tokubai into Postgres+Blob, and shows them on a clustered map with search and click-to-view.

**Architecture:** A single Next.js (App Router) project. `/api/cron/sync-flyers` is a serverless route triggered daily by Vercel Cron; it uses the Firecrawl SDK to discover stores and scrape flyers, diffs against Postgres, and syncs Blob storage. The `/` page renders a client-side Leaflet map (fed by a `/api/stores` route) with clustering, search, and a responsive popup/panel for viewing flyers.

**Tech Stack:** Next.js 16 (App Router, TypeScript), `firecrawl` SDK (^4.28.2), `@vercel/postgres` (^0.10.0), `@vercel/blob` (^2.4.1), `leaflet` (^1.9.4) + `react-leaflet` (^5.0.0) + `leaflet.markercluster` (^1.5.3), Vitest (^4.1.9) for unit tests.

## Global Constraints

- Chain scope: Comodi Iida only (~82 stores), source is `tokubai.co.jp`.
- Retention: current flyers only — superseded flyers are deleted (DB row + Blob object), not archived.
- Store list is re-discovered from the Tokubai chain page on every cron run (not hardcoded).
- Cron job processes stores in concurrent batches (batch size 8) to stay within Vercel's function timeout.
- Cron job is best-effort: a single store's scrape failure is logged and skipped; it does not abort the run, and that store's existing DB rows are left untouched until a future run succeeds.
- Flyer images are re-hosted on Vercel Blob — the frontend never hot-links Tokubai's CDN.
- Map: Leaflet + OpenStreetMap tiles, no API key. Markers cluster; popup on desktop/tablet, bottom panel on mobile.
- No authentication; frontend is public/read-only. No other chains, no flyer history, no OCR, no alerting.

---

## File Structure

```
package.json
tsconfig.json
next.config.ts
.env.example
src/
  lib/
    tokubai.ts          # parsing helpers: extract store list, store detail, flyer image URLs
    tokubai.test.ts
    db.ts                # Postgres schema init + query helpers (stores, flyers)
    db.test.ts
    sync.ts              # orchestrates one cron run: discover -> scrape -> diff -> persist
    sync.test.ts
  app/
    api/
      cron/
        sync-flyers/
          route.ts        # Vercel Cron entry point, calls lib/sync.ts
      stores/
        route.ts          # GET: returns all stores + their current flyers as JSON
    page.tsx               # renders <FlyerMap />
    layout.tsx
    globals.css
  components/
    FlyerMap.tsx            # Leaflet map, clustering, search box, responsive popup/panel
    FlyerMap.test.tsx
    StoreSearch.tsx          # search input, filters store list
    StoreSearch.test.tsx
    FlyerViewer.tsx          # popup (desktop) / bottom sheet (mobile) content
    FlyerViewer.test.tsx
vercel.json                  # cron schedule config
```

**Responsibilities:**
- `lib/tokubai.ts` — pure functions that parse Firecrawl's markdown output into typed data (store list, store detail, flyer image URLs). No network calls, no DB. Fully unit-testable with fixture strings.
- `lib/db.ts` — all SQL. Exposes typed functions (`upsertStore`, `getStoreFlyerImageIds`, `upsertFlyer`, `deleteFlyer`, `getAllStoresWithFlyers`). Nothing else touches `@vercel/postgres` directly.
- `lib/sync.ts` — the cron orchestration: calls Firecrawl (via injected client), calls `lib/tokubai.ts` parsers, calls `lib/db.ts`, calls Blob upload/delete. Batches concurrency. Catches and logs per-store errors.
- `app/api/cron/sync-flyers/route.ts` — thin HTTP wrapper around `lib/sync.ts`.
- `app/api/stores/route.ts` — thin HTTP wrapper around `lib/db.ts`'s `getAllStoresWithFlyers`.
- `components/FlyerMap.tsx` — Leaflet setup, clustering, fetches `/api/stores`, renders markers, owns responsive popup-vs-panel decision.
- `components/StoreSearch.tsx` — controlled search input + filtering logic, used by `FlyerMap`.
- `components/FlyerViewer.tsx` — pure presentational component showing a store's name + flyer images, used inside both the popup and the panel.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.env.example`, `.gitignore` (update existing)

**Interfaces:**
- Produces: a running Next.js app with TypeScript, reachable at `/`, with a placeholder page.

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd ~/Documents/superPromo
npx --yes create-next-app@latest . --typescript --eslint --app --src-dir --no-tailwind --import-alias "@/*" --use-npm --skip-install
```

When prompted about the existing directory/files, choose to proceed in the current directory.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install firecrawl@^4.28.2 @vercel/postgres@^0.10.0 @vercel/blob@^2.4.1 leaflet@^1.9.4 react-leaflet@^5.0.0 leaflet.markercluster@^1.5.3
npm install -D vitest@^4.1.9 @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^25 @types/leaflet@^1.9.12 @types/leaflet.markercluster@^1.5.4
```

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

Create `vitest.setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

Add to `package.json` `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Add `.env.example`**

```
FIRECRAWL_API_KEY=
POSTGRES_URL=
BLOB_READ_WRITE_TOKEN=
CRON_SECRET=
```

- [ ] **Step 5: Update `.gitignore`**

Confirm it includes (it already has most of these from the design-doc commit):

```
node_modules/
.next/
.env
.env.*
.superpowers/
.firecrawl/
```

- [ ] **Step 6: Verify dev server runs**

```bash
npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
kill %1
```

Expected: `200`

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts vitest.config.ts vitest.setup.ts src/app .env.example .gitignore eslint.config.mjs
git commit -m "Scaffold Next.js app with test runner and dependencies"
```

---

## Task 2: Tokubai Parsing Helpers

**Files:**
- Create: `src/lib/tokubai.ts`
- Test: `src/lib/tokubai.test.ts`

**Interfaces:**
- Consumes: nothing (pure parsing functions over markdown strings).
- Produces:
  ```typescript
  interface StoreListing {
    tokubaiStoreId: string;
    name: string;
    detailUrl: string;
  }
  interface StoreDetail {
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    leafletUrls: string[]; // detail-page URLs, e.g. ".../259321/leaflets/102270935"
  }
  interface FlyerImage {
    tokubaiImageId: string;
    originalUrl: string; // o=true URL
  }

  function parseStoreList(markdown: string): StoreListing[];
  function parseStoreDetail(markdown: string): StoreDetail;
  function parseFlyerImages(markdown: string): FlyerImage[];
  ```

- [ ] **Step 1: Write failing tests using real fixture markdown**

Create `src/lib/tokubai.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/tokubai.test.ts
```

Expected: FAIL — `Cannot find module './tokubai'` (file doesn't exist yet).

- [ ] **Step 3: Implement `src/lib/tokubai.ts`**

```typescript
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

const STORE_LINK_RE = /\[([^\]]*コモディイイダ[^\]]*)\]\((https:\/\/tokubai\.co\.jp\/[^)]*\/(\d+))\)/g;

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/tokubai.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tokubai.ts src/lib/tokubai.test.ts
git commit -m "Add Tokubai markdown parsing helpers"
```

---

## Task 3: Database Layer

**Files:**
- Create: `src/lib/db.ts`
- Test: `src/lib/db.test.ts`

**Interfaces:**
- Consumes: `@vercel/postgres` `sql` client (test uses an injected mock pool, not a real DB).
- Produces:
  ```typescript
  interface StoreRow {
    id: number;
    tokubaiStoreId: string;
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  }
  interface FlyerRow {
    id: number;
    storeId: number;
    tokubaiImageId: string;
    blobUrl: string;
  }
  interface StoreWithFlyers extends StoreRow {
    flyers: { tokubaiImageId: string; blobUrl: string }[];
  }

  async function ensureSchema(): Promise<void>;
  async function upsertStore(input: { tokubaiStoreId: string; name: string; address: string | null; lat: number | null; lng: number | null }): Promise<StoreRow>;
  async function getFlyerImageIdsForStore(storeId: number): Promise<string[]>;
  async function upsertFlyer(input: { storeId: number; tokubaiImageId: string; blobUrl: string }): Promise<void>;
  async function deleteFlyersNotIn(storeId: number, keepImageIds: string[]): Promise<FlyerRow[]>; // returns deleted rows so caller can remove their blobs
  async function getAllStoresWithFlyers(): Promise<StoreWithFlyers[]>;
  ```

- [ ] **Step 1: Write failing tests against a real local Postgres via `@vercel/postgres`'s connection string**

This task needs an actual Postgres to test against (Vercel's `sql` template-tag client talks to a real server; mocking it would test nothing meaningful). Use a local Postgres for tests.

Create `src/lib/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { sql } from "@vercel/postgres";
import {
  ensureSchema,
  upsertStore,
  getFlyerImageIdsForStore,
  upsertFlyer,
  deleteFlyersNotIn,
  getAllStoresWithFlyers,
} from "./db";

beforeEach(async () => {
  await ensureSchema();
  await sql`TRUNCATE flyers, stores RESTART IDENTITY CASCADE`;
});

afterAll(async () => {
  await sql`TRUNCATE flyers, stores RESTART IDENTITY CASCADE`;
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
```

- [ ] **Step 2: Start a local Postgres and point `POSTGRES_URL` at it**

```bash
docker run -d --name superpromo-test-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
sleep 2
export POSTGRES_URL="postgres://postgres:postgres@localhost:5433/postgres"
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/lib/db.test.ts
```

Expected: FAIL — `Cannot find module './db'`.

- [ ] **Step 4: Implement `src/lib/db.ts`**

```typescript
import { sql } from "@vercel/postgres";

export interface StoreRow {
  id: number;
  tokubaiStoreId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export interface FlyerRow {
  id: number;
  storeId: number;
  tokubaiImageId: string;
  blobUrl: string;
}

export interface StoreWithFlyers extends StoreRow {
  flyers: { tokubaiImageId: string; blobUrl: string }[];
}

export async function ensureSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS stores (
      id serial PRIMARY KEY,
      tokubai_store_id text UNIQUE NOT NULL,
      name text NOT NULL,
      address text,
      lat double precision,
      lng double precision,
      last_scraped_at timestamptz
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS flyers (
      id serial PRIMARY KEY,
      store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      tokubai_image_id text NOT NULL,
      blob_url text NOT NULL,
      updated_at timestamptz DEFAULT now(),
      UNIQUE (store_id, tokubai_image_id)
    )
  `;
}

function toStoreRow(row: Record<string, unknown>): StoreRow {
  return {
    id: row.id as number,
    tokubaiStoreId: row.tokubai_store_id as string,
    name: row.name as string,
    address: row.address as string | null,
    lat: row.lat as number | null,
    lng: row.lng as number | null,
  };
}

export async function upsertStore(input: {
  tokubaiStoreId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}): Promise<StoreRow> {
  const { rows } = await sql`
    INSERT INTO stores (tokubai_store_id, name, address, lat, lng, last_scraped_at)
    VALUES (${input.tokubaiStoreId}, ${input.name}, ${input.address}, ${input.lat}, ${input.lng}, now())
    ON CONFLICT (tokubai_store_id)
    DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address,
                  lat = EXCLUDED.lat, lng = EXCLUDED.lng, last_scraped_at = now()
    RETURNING id, tokubai_store_id, name, address, lat, lng
  `;
  return toStoreRow(rows[0]);
}

export async function getFlyerImageIdsForStore(storeId: number): Promise<string[]> {
  const { rows } = await sql`
    SELECT tokubai_image_id FROM flyers WHERE store_id = ${storeId}
  `;
  return rows.map((r) => r.tokubai_image_id as string);
}

export async function upsertFlyer(input: { storeId: number; tokubaiImageId: string; blobUrl: string }): Promise<void> {
  await sql`
    INSERT INTO flyers (store_id, tokubai_image_id, blob_url, updated_at)
    VALUES (${input.storeId}, ${input.tokubaiImageId}, ${input.blobUrl}, now())
    ON CONFLICT (store_id, tokubai_image_id)
    DO UPDATE SET blob_url = EXCLUDED.blob_url, updated_at = now()
  `;
}

export async function deleteFlyersNotIn(storeId: number, keepImageIds: string[]): Promise<FlyerRow[]> {
  const { rows } = await sql`
    DELETE FROM flyers
    WHERE store_id = ${storeId}
      AND tokubai_image_id <> ALL(${keepImageIds.length ? keepImageIds : [""]})
    RETURNING id, store_id, tokubai_image_id, blob_url
  `;
  return rows.map((r) => ({
    id: r.id as number,
    storeId: r.store_id as number,
    tokubaiImageId: r.tokubai_image_id as string,
    blobUrl: r.blob_url as string,
  }));
}

export async function getAllStoresWithFlyers(): Promise<StoreWithFlyers[]> {
  const { rows: storeRows } = await sql`SELECT * FROM stores ORDER BY id`;
  const { rows: flyerRows } = await sql`SELECT * FROM flyers ORDER BY id`;

  return storeRows.map((s) => ({
    ...toStoreRow(s),
    flyers: flyerRows
      .filter((f) => f.store_id === s.id)
      .map((f) => ({ tokubaiImageId: f.tokubai_image_id as string, blobUrl: f.blob_url as string })),
  }));
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/lib/db.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Stop the test Postgres container**

```bash
docker stop superpromo-test-pg && docker rm superpromo-test-pg
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "Add Postgres data layer for stores and flyers"
```

---

## Task 4: Sync Orchestration

**Files:**
- Create: `src/lib/sync.ts`
- Test: `src/lib/sync.test.ts`

**Interfaces:**
- Consumes:
  - From Task 2: `parseStoreList`, `parseStoreDetail`, `parseFlyerImages`, and their types.
  - From Task 3: `upsertStore`, `getFlyerImageIdsForStore`, `upsertFlyer`, `deleteFlyersNotIn`.
  - A `FirecrawlClient` interface (so tests can inject a fake):
    ```typescript
    interface FirecrawlClient {
      scrape(url: string): Promise<{ markdown: string }>;
    }
    ```
  - A `BlobClient` interface:
    ```typescript
    interface BlobClient {
      upload(tokubaiImageId: string, sourceUrl: string): Promise<string>; // returns blob URL
      delete(blobUrl: string): Promise<void>;
    }
    ```
- Produces:
  ```typescript
  interface SyncResult {
    storesProcessed: number;
    storesFailed: { tokubaiStoreId: string; error: string }[];
  }
  async function syncFlyers(deps: { firecrawl: FirecrawlClient; blob: BlobClient; concurrency?: number }): Promise<SyncResult>;
  ```

- [ ] **Step 1: Write failing tests with fake Firecrawl/Blob clients**

Create `src/lib/sync.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sql } from "@vercel/postgres";
import { ensureSchema, getAllStoresWithFlyers } from "./db";
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
  await sql`TRUNCATE flyers, stores RESTART IDENTITY CASCADE`;
});

afterEach(async () => {
  await sql`TRUNCATE flyers, stores RESTART IDENTITY CASCADE`;
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
        if (url === "https://tokubai.co.jp/x/7530") return { markdown: STORE_DETAIL_MD.replace("259321", "7530") };
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
```

- [ ] **Step 2: Start local Postgres for this test run**

```bash
docker run -d --name superpromo-test-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
sleep 2
export POSTGRES_URL="postgres://postgres:postgres@localhost:5433/postgres"
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/lib/sync.test.ts
```

Expected: FAIL — `Cannot find module './sync'`.

- [ ] **Step 4: Implement `src/lib/sync.ts`**

```typescript
import { parseStoreList, parseStoreDetail, parseFlyerImages } from "./tokubai";
import { upsertStore, getFlyerImageIdsForStore, upsertFlyer, deleteFlyersNotIn } from "./db";

export interface FirecrawlClient {
  scrape(url: string): Promise<{ markdown: string }>;
}

export interface BlobClient {
  upload(tokubaiImageId: string, sourceUrl: string): Promise<string>;
  delete(blobUrl: string): Promise<void>;
}

export interface SyncResult {
  storesProcessed: number;
  storesFailed: { tokubaiStoreId: string; error: string }[];
}

const CHAIN_LEAFLET_URL = "https://tokubai.co.jp/%E3%82%B3%E3%83%A2%E3%83%87%E3%82%A3%E3%82%A4%E3%82%A4%E3%83%80/leaflet";

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

  const currentImageIds = new Set<string>();
  for (const leafletUrl of detail.leafletUrls) {
    const leafletPage = await deps.firecrawl.scrape(leafletUrl);
    for (const image of parseFlyerImages(leafletPage.markdown)) {
      currentImageIds.add(image.tokubaiImageId);
    }
  }

  const existingImageIds = new Set(await getFlyerImageIdsForStore(store.id));
  const newImageIds = [...currentImageIds].filter((id) => !existingImageIds.has(id));

  for (const leafletUrl of detail.leafletUrls) {
    const leafletPage = await deps.firecrawl.scrape(leafletUrl);
    for (const image of parseFlyerImages(leafletPage.markdown)) {
      if (!newImageIds.includes(image.tokubaiImageId)) continue;
      const blobUrl = await deps.blob.upload(image.tokubaiImageId, image.originalUrl);
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
  const chainPage = await deps.firecrawl.scrape(CHAIN_LEAFLET_URL);
  const stores = parseStoreList(chainPage.markdown);

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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/lib/sync.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Stop the test Postgres container**

```bash
docker stop superpromo-test-pg && docker rm superpromo-test-pg
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/sync.ts src/lib/sync.test.ts
git commit -m "Add cron sync orchestration with per-store error isolation"
```

---

## Task 5: Cron and Stores API Routes

**Files:**
- Create: `src/app/api/cron/sync-flyers/route.ts`
- Create: `src/app/api/stores/route.ts`
- Create: `vercel.json`
- Modify: `.env.example` (already has the needed vars from Task 1)

**Interfaces:**
- Consumes: `syncFlyers` (Task 4), `getAllStoresWithFlyers` (Task 3), `firecrawl` npm package, `@vercel/blob` npm package.
- Produces: `GET /api/cron/sync-flyers` (protected by `CRON_SECRET` bearer check), `GET /api/stores` (public JSON).

- [ ] **Step 1: Implement the real Firecrawl/Blob adapters and the cron route**

Create `src/app/api/cron/sync-flyers/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Firecrawl from "firecrawl";
import { put, del } from "@vercel/blob";
import { ensureSchema } from "@/lib/db";
import { syncFlyers, type FirecrawlClient, type BlobClient } from "@/lib/sync";

export const maxDuration = 300;

function buildFirecrawlClient(): FirecrawlClient {
  const client = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! });
  return {
    async scrape(url: string) {
      const doc = await client.scrape(url);
      return { markdown: doc.markdown ?? "" };
    },
  };
}

function buildBlobClient(): BlobClient {
  return {
    async upload(tokubaiImageId: string, sourceUrl: string) {
      const response = await fetch(sourceUrl);
      const bytes = await response.arrayBuffer();
      const blob = await put(`flyers/${tokubaiImageId}.jpg`, Buffer.from(bytes), {
        access: "public",
        addRandomSuffix: false,
      });
      return blob.url;
    },
    async delete(blobUrl: string) {
      await del(blobUrl);
    },
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  const result = await syncFlyers({
    firecrawl: buildFirecrawlClient(),
    blob: buildBlobClient(),
    concurrency: 8,
  });

  return NextResponse.json(result);
}
```

Create `src/app/api/stores/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { ensureSchema, getAllStoresWithFlyers } from "@/lib/db";

export async function GET() {
  await ensureSchema();
  const stores = await getAllStoresWithFlyers();
  return NextResponse.json(stores);
}
```

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-flyers",
      "schedule": "0 18 * * *"
    }
  ]
}
```

`0 18 * * *` is UTC — 18:00 UTC is 03:00 JST, an off-peak hour for the daily refresh.

- [ ] **Step 2: Verify the routes build**

```bash
npm run build
```

Expected: build succeeds with no type errors. (Routes aren't exercised against a real DB/Firecrawl here — that's covered by Task 3/4's tests. This step only checks the route files compile and wire up correctly.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api vercel.json
git commit -m "Add cron sync route and public stores API route"
```

---

## Task 6: Flyer Viewer Component

**Files:**
- Create: `src/components/FlyerViewer.tsx`
- Test: `src/components/FlyerViewer.test.tsx`

**Interfaces:**
- Consumes: nothing external — pure presentational component.
- Produces:
  ```typescript
  interface FlyerViewerProps {
    storeName: string;
    flyers: { tokubaiImageId: string; blobUrl: string }[];
  }
  export function FlyerViewer(props: FlyerViewerProps): JSX.Element;
  ```
  Renders store name as a heading, each flyer as a clickable thumbnail (`<img>`, `data-testid="flyer-thumbnail"`), and clicking a thumbnail opens a full-size lightbox overlay (`data-testid="flyer-lightbox"`) showing that image; clicking the lightbox closes it.

- [ ] **Step 1: Write failing tests**

Create `src/components/FlyerViewer.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FlyerViewer } from "./FlyerViewer";

const FLYERS = [
  { tokubaiImageId: "111", blobUrl: "https://blob.example/111.jpg" },
  { tokubaiImageId: "222", blobUrl: "https://blob.example/222.jpg" },
];

describe("FlyerViewer", () => {
  it("renders the store name and a thumbnail per flyer", () => {
    render(<FlyerViewer storeName="コモディイイダ 鹿浜店" flyers={FLYERS} />);
    expect(screen.getByText("コモディイイダ 鹿浜店")).toBeInTheDocument();
    expect(screen.getAllByTestId("flyer-thumbnail")).toHaveLength(2);
  });

  it("shows a message instead of thumbnails when there are no flyers", () => {
    render(<FlyerViewer storeName="コモディイイダ 鹿浜店" flyers={[]} />);
    expect(screen.getByText(/no current flyers/i)).toBeInTheDocument();
  });

  it("opens a lightbox with the full-size image when a thumbnail is clicked", () => {
    render(<FlyerViewer storeName="コモディイイダ 鹿浜店" flyers={FLYERS} />);
    expect(screen.queryByTestId("flyer-lightbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId("flyer-thumbnail")[1]);

    const lightbox = screen.getByTestId("flyer-lightbox");
    expect(lightbox).toBeInTheDocument();
    expect(lightbox.querySelector("img")).toHaveAttribute("src", "https://blob.example/222.jpg");
  });

  it("closes the lightbox when it is clicked again", () => {
    render(<FlyerViewer storeName="コモディイイダ 鹿浜店" flyers={FLYERS} />);
    fireEvent.click(screen.getAllByTestId("flyer-thumbnail")[0]);
    fireEvent.click(screen.getByTestId("flyer-lightbox"));
    expect(screen.queryByTestId("flyer-lightbox")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/FlyerViewer.test.tsx
```

Expected: FAIL — `Cannot find module './FlyerViewer'`.

- [ ] **Step 3: Implement `src/components/FlyerViewer.tsx`**

```typescript
"use client";

import { useState } from "react";

export interface FlyerViewerProps {
  storeName: string;
  flyers: { tokubaiImageId: string; blobUrl: string }[];
}

export function FlyerViewer({ storeName, flyers }: FlyerViewerProps) {
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  return (
    <div>
      <h3>{storeName}</h3>
      {flyers.length === 0 ? (
        <p>No current flyers for this store.</p>
      ) : (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {flyers.map((flyer) => (
            <img
              key={flyer.tokubaiImageId}
              data-testid="flyer-thumbnail"
              src={flyer.blobUrl}
              alt={`Flyer for ${storeName}`}
              style={{ width: "80px", height: "auto", cursor: "pointer" }}
              onClick={() => setOpenUrl(flyer.blobUrl)}
            />
          ))}
        </div>
      )}
      {openUrl && (
        <div
          data-testid="flyer-lightbox"
          onClick={() => setOpenUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <img src={openUrl} alt={`Full-size flyer for ${storeName}`} style={{ maxWidth: "90vw", maxHeight: "90vh" }} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/FlyerViewer.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/FlyerViewer.tsx src/components/FlyerViewer.test.tsx
git commit -m "Add FlyerViewer presentational component with lightbox"
```

---

## Task 7: Store Search Component

**Files:**
- Create: `src/components/StoreSearch.tsx`
- Test: `src/components/StoreSearch.test.tsx`

**Interfaces:**
- Consumes: a list of stores (shape from Task 3's `StoreWithFlyers`, but only `name`/`address`/`id` are used here).
- Produces:
  ```typescript
  interface SearchableStore {
    id: number;
    name: string;
    address: string | null;
  }
  interface StoreSearchProps {
    stores: SearchableStore[];
    onMatchesChange: (matchedIds: Set<number>) => void;
  }
  export function StoreSearch(props: StoreSearchProps): JSX.Element;
  ```
  Renders a text `<input data-testid="store-search-input">`. On every keystroke, calls `onMatchesChange` with the set of store ids whose `name` or `address` contains the query (case-insensitive substring match). Empty query matches all stores.

- [ ] **Step 1: Write failing tests**

Create `src/components/StoreSearch.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StoreSearch } from "./StoreSearch";

const STORES = [
  { id: 1, name: "コモディイイダ 鹿浜店", address: "東京都足立区鹿浜7-2-3" },
  { id: 2, name: "コモディイイダ 越谷店", address: "埼玉県越谷市" },
];

describe("StoreSearch", () => {
  it("reports all store ids as matches when the query is empty", () => {
    const onMatchesChange = vi.fn();
    render(<StoreSearch stores={STORES} onMatchesChange={onMatchesChange} />);
    expect(onMatchesChange).toHaveBeenCalledWith(new Set([1, 2]));
  });

  it("filters by name substring, case-insensitively", () => {
    const onMatchesChange = vi.fn();
    render(<StoreSearch stores={STORES} onMatchesChange={onMatchesChange} />);

    fireEvent.change(screen.getByTestId("store-search-input"), { target: { value: "鹿浜" } });

    expect(onMatchesChange).toHaveBeenLastCalledWith(new Set([1]));
  });

  it("filters by address substring", () => {
    const onMatchesChange = vi.fn();
    render(<StoreSearch stores={STORES} onMatchesChange={onMatchesChange} />);

    fireEvent.change(screen.getByTestId("store-search-input"), { target: { value: "埼玉" } });

    expect(onMatchesChange).toHaveBeenLastCalledWith(new Set([2]));
  });

  it("reports an empty set when nothing matches", () => {
    const onMatchesChange = vi.fn();
    render(<StoreSearch stores={STORES} onMatchesChange={onMatchesChange} />);

    fireEvent.change(screen.getByTestId("store-search-input"), { target: { value: "nonexistent" } });

    expect(onMatchesChange).toHaveBeenLastCalledWith(new Set());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/StoreSearch.test.tsx
```

Expected: FAIL — `Cannot find module './StoreSearch'`.

- [ ] **Step 3: Implement `src/components/StoreSearch.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";

export interface SearchableStore {
  id: number;
  name: string;
  address: string | null;
}

export interface StoreSearchProps {
  stores: SearchableStore[];
  onMatchesChange: (matchedIds: Set<number>) => void;
}

export function StoreSearch({ stores, onMatchesChange }: StoreSearchProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized === "") {
      onMatchesChange(new Set(stores.map((s) => s.id)));
      return;
    }
    const matches = stores.filter(
      (s) => s.name.toLowerCase().includes(normalized) || (s.address ?? "").toLowerCase().includes(normalized),
    );
    onMatchesChange(new Set(matches.map((s) => s.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, stores]);

  return (
    <input
      data-testid="store-search-input"
      type="text"
      placeholder="Search store name or area..."
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/StoreSearch.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/StoreSearch.tsx src/components/StoreSearch.test.tsx
git commit -m "Add StoreSearch component with name/address filtering"
```

---

## Task 8: Flyer Map Component and Home Page

**Files:**
- Create: `src/components/FlyerMap.tsx`
- Test: `src/components/FlyerMap.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `StoreSearch` (Task 7), `FlyerViewer` (Task 6), `leaflet`/`react-leaflet`/`leaflet.markercluster`, `GET /api/stores` (Task 5).
- Produces: `export function FlyerMap(): JSX.Element` — fetches `/api/stores` on mount, renders a Leaflet map with clustered markers for stores that have `lat`/`lng`, filters visible markers using `StoreSearch`'s matched-id set, and on marker click shows a `FlyerViewer` either in a popup (`window.innerWidth >= 768`) or a fixed bottom panel (`window.innerWidth < 768`).

- [ ] **Step 1: Write failing tests with a mocked `fetch` and mocked Leaflet internals**

`react-leaflet` requires a real DOM layout engine for its canvas/SVG panes that jsdom doesn't fully provide, so this test mocks `react-leaflet` itself and verifies `FlyerMap`'s data-fetching, filtering, and responsive-selection logic — the parts with real conditional behavior. The actual Leaflet rendering is verified manually per Task 8 Step 6 below.

Create `src/components/FlyerMap.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children, eventHandlers, position }: any) => (
    <button data-testid="marker" data-position={JSON.stringify(position)} onClick={() => eventHandlers.click()}>
      {children}
    </button>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn() }),
}));

vi.mock("leaflet.markercluster", () => ({}));

import { FlyerMap } from "./FlyerMap";

const STORES = [
  { id: 1, tokubaiStoreId: "259321", name: "コモディイイダ 鹿浜店", address: "東京都足立区鹿浜7-2-3", lat: 35.78, lng: 139.76, flyers: [{ tokubaiImageId: "111", blobUrl: "https://blob.example/111.jpg" }] },
  { id: 2, tokubaiStoreId: "7530", name: "コモディイイダ 越谷店", address: "埼玉県越谷市", lat: 35.88, lng: 139.79, flyers: [] },
  { id: 3, tokubaiStoreId: "999", name: "コモディイイダ ジオ無し店", address: null, lat: null, lng: null, flyers: [] },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => STORES })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FlyerMap", () => {
  it("fetches stores and renders one marker per store with coordinates", async () => {
    render(<FlyerMap />);
    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(2));
  });

  it("filters markers based on search matches", async () => {
    render(<FlyerMap />);
    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(2));

    fireEvent.change(screen.getByTestId("store-search-input"), { target: { value: "鹿浜" } });

    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(1));
  });

  it("shows a popup with the FlyerViewer on desktop width when a marker is clicked", async () => {
    vi.stubGlobal("innerWidth", 1024);
    render(<FlyerMap />);
    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(2));

    fireEvent.click(screen.getAllByTestId("marker")[0]);

    expect(screen.getByTestId("popup")).toBeInTheDocument();
    expect(screen.queryByTestId("flyer-panel")).not.toBeInTheDocument();
  });

  it("shows a bottom panel with the FlyerViewer on mobile width when a marker is clicked", async () => {
    vi.stubGlobal("innerWidth", 480);
    render(<FlyerMap />);
    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(2));

    fireEvent.click(screen.getAllByTestId("marker")[0]);

    expect(screen.getByTestId("flyer-panel")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/FlyerMap.test.tsx
```

Expected: FAIL — `Cannot find module './FlyerMap'`.

- [ ] **Step 3: Implement `src/components/FlyerMap.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { StoreSearch, type SearchableStore } from "./StoreSearch";
import { FlyerViewer } from "./FlyerViewer";

interface Store extends SearchableStore {
  tokubaiStoreId: string;
  lat: number | null;
  lng: number | null;
  flyers: { tokubaiImageId: string; blobUrl: string }[];
}

const MOBILE_BREAKPOINT_PX = 768;

export function FlyerMap() {
  const [stores, setStores] = useState<Store[]>([]);
  const [matchedIds, setMatchedIds] = useState<Set<number>>(new Set());
  const [activeStoreId, setActiveStoreId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/stores")
      .then((res) => res.json())
      .then((data: Store[]) => setStores(data));
  }, []);

  const geocodedStores = stores.filter((s) => s.lat !== null && s.lng !== null);
  const visibleStores = geocodedStores.filter((s) => matchedIds.has(s.id));
  const activeStore = stores.find((s) => s.id === activeStoreId) ?? null;
  const isMobile = typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX;

  return (
    <div>
      <StoreSearch stores={geocodedStores} onMatchesChange={setMatchedIds} />
      <MapContainer center={[35.6895, 139.6917]} zoom={10} style={{ height: "80vh", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {visibleStores.map((store) => (
          <Marker
            key={store.id}
            position={[store.lat as number, store.lng as number]}
            eventHandlers={{ click: () => setActiveStoreId(store.id) }}
          >
            {!isMobile && activeStoreId === store.id && (
              <Popup>
                <FlyerViewer storeName={store.name} flyers={store.flyers} />
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
      {isMobile && activeStore && (
        <div
          data-testid="flyer-panel"
          style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "white", padding: "16px", boxShadow: "0 -2px 8px rgba(0,0,0,0.2)" }}
        >
          <button onClick={() => setActiveStoreId(null)}>Close</button>
          <FlyerViewer storeName={activeStore.name} flyers={activeStore.flyers} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/FlyerMap.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Wire `FlyerMap` into the home page**

Modify `src/app/page.tsx`:

```typescript
import { FlyerMap } from "@/components/FlyerMap";

export default function Home() {
  return (
    <main>
      <h1>Comodi Iida Flyers</h1>
      <FlyerMap />
    </main>
  );
}
```

- [ ] **Step 6: Add marker clustering**

Marker clustering needs real Leaflet DOM APIs and is impractical to unit test meaningfully (Step 1's mock replaces `react-leaflet` entirely). Add it directly and verify manually in Step 7.

Modify `src/components/FlyerMap.tsx` to wrap markers in a cluster group — replace the `<MapContainer>` block with:

```typescript
import MarkerClusterGroup from "react-leaflet-cluster";
```

```bash
npm install react-leaflet-cluster@^4.1.3
```

Then change the JSX so markers render inside `<MarkerClusterGroup>`:

```typescript
        <MarkerClusterGroup>
          {visibleStores.map((store) => (
            <Marker
              key={store.id}
              position={[store.lat as number, store.lng as number]}
              eventHandlers={{ click: () => setActiveStoreId(store.id) }}
            >
              {!isMobile && activeStoreId === store.id && (
                <Popup>
                  <FlyerViewer storeName={store.name} flyers={store.flyers} />
                </Popup>
              )}
            </Marker>
          ))}
        </MarkerClusterGroup>
```

Re-run `npx vitest run src/components/FlyerMap.test.tsx` — the mocked `react-leaflet` module doesn't export `MarkerClusterGroup` from that path (it's a separate package), so the existing mocks are unaffected; tests should still pass.

- [ ] **Step 7: Manual verification in a real browser**

```bash
docker run -d --name superpromo-test-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
sleep 2
export POSTGRES_URL="postgres://postgres:postgres@localhost:5433/postgres"
npm run dev
```

Open `http://localhost:3000`. Since there's no seeded data yet, the map will render with no markers — confirm:
1. The page loads with no console errors.
2. The map tiles render (OpenStreetMap).
3. The search input is visible.

Stop the dev server and the test DB:

```bash
docker stop superpromo-test-pg && docker rm superpromo-test-pg
```

(Full end-to-end verification with real store data happens in Task 9, after the cron sync can be run manually against this DB.)

- [ ] **Step 8: Commit**

```bash
git add src/components/FlyerMap.tsx src/components/FlyerMap.test.tsx src/app/page.tsx package.json package-lock.json
git commit -m "Add FlyerMap with clustering, search filtering, and responsive flyer view"
```

---

## Task 9: End-to-End Manual Verification

**Files:** none (verification only).

**Interfaces:** none — this task exercises Tasks 1–8 together against a real Firecrawl account and a local Postgres.

- [ ] **Step 1: Start a local Postgres**

```bash
docker run -d --name superpromo-dev-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
sleep 2
```

- [ ] **Step 2: Create `.env.local` with real credentials**

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
FIRECRAWL_API_KEY=<your real key from `firecrawl config`>
POSTGRES_URL=postgres://postgres:postgres@localhost:5433/postgres
BLOB_READ_WRITE_TOKEN=<leave blank for this local run — see step 4>
CRON_SECRET=local-dev-secret
```

- [ ] **Step 3: Temporarily stub Blob for a local-only run**

Vercel Blob requires a deployed/linked Vercel project to get a real `BLOB_READ_WRITE_TOKEN`. For this local manual check, temporarily swap `buildBlobClient()` in `src/app/api/cron/sync-flyers/route.ts` to write files to disk instead:

```typescript
function buildBlobClient(): BlobClient {
  const fs = require("fs");
  const path = require("path");
  const dir = path.join(process.cwd(), ".local-blob");
  fs.mkdirSync(dir, { recursive: true });
  return {
    async upload(tokubaiImageId: string, sourceUrl: string) {
      const response = await fetch(sourceUrl);
      const bytes = await response.arrayBuffer();
      const filePath = path.join(dir, `${tokubaiImageId}.jpg`);
      fs.writeFileSync(filePath, Buffer.from(bytes));
      return `/local-blob/${tokubaiImageId}.jpg`;
    },
    async delete(blobUrl: string) {
      const filePath = path.join(dir, path.basename(blobUrl));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    },
  };
}
```

This is a temporary local-only edit — do not commit it. (Real Blob usage is exercised after Task 10's Vercel deployment.)

- [ ] **Step 4: Run the dev server and trigger the cron route manually**

```bash
npm run dev &
sleep 3
curl -s -H "Authorization: Bearer local-dev-secret" http://localhost:3000/api/cron/sync-flyers
```

Expected: JSON response like `{"storesProcessed":82,"storesFailed":[]}` (some failures are acceptable per the best-effort design — check that `storesProcessed` is close to 82).

This call takes a while (82 stores, real network requests to Tokubai) — expect it to run for a few minutes given `concurrency: 8`.

- [ ] **Step 5: Confirm data landed in Postgres**

```bash
curl -s http://localhost:3000/api/stores | head -c 500
```

Expected: a JSON array of store objects with non-null `lat`/`lng` for most entries and at least one `flyers` entry for stores currently running a promotion.

- [ ] **Step 6: Open the map in a browser and confirm visually**

Open `http://localhost:3000`. Confirm:
1. Clustered pins appear across Japan (concentrated wherever Comodi Iida operates).
2. Typing a known store name (e.g. "鹿浜") in the search box narrows the visible pins.
3. Clicking a pin shows a popup (desktop width) with flyer thumbnails; clicking a thumbnail opens the full-size lightbox.
4. Resizing the browser below 768px width and clicking a pin shows the bottom panel instead of a popup.

- [ ] **Step 7: Revert the temporary Blob stub and stop services**

```bash
git checkout src/app/api/cron/sync-flyers/route.ts
kill %1
docker stop superpromo-dev-pg && docker rm superpromo-dev-pg
rm -rf .local-blob
```

No commit for this task — it's verification only, and Step 7 already reverted the temporary edit.

---

## Task 10: Vercel Deployment Configuration

**Files:**
- Modify: `readme.md` (replace the original sketch notes with setup instructions)

**Interfaces:** none — this task wires the already-built app to real Vercel infrastructure.

- [ ] **Step 1: Link the project to Vercel**

```bash
npx vercel login
npx vercel link
```

Follow the prompts to create or select a Vercel project (this is the point to confirm/set the project name, e.g. `promosupercomo`, if desired — see the separate GitHub remote-naming preference already noted).

- [ ] **Step 2: Provision Vercel Postgres and Blob**

Vercel Postgres is provisioned as a marketplace integration (no longer a
standalone `vercel postgres` command). Run this and follow the interactive
prompts to create a new Postgres database (the underlying provider is
Neon) and connect it to the linked project:

```bash
npx vercel integration add neon
```

Blob has its own dedicated command:

```bash
npx vercel blob create-store
```

After both complete, pull the env vars they configured into your project link:

```bash
npx vercel env pull .env.vercel
```

Confirm `.env.vercel` contains `POSTGRES_URL` and `BLOB_READ_WRITE_TOKEN`
— these were added to the Vercel project automatically by the two
commands above.

- [ ] **Step 3: Set the remaining environment variables**

```bash
npx vercel env add FIRECRAWL_API_KEY production
npx vercel env add CRON_SECRET production
```

Paste the real Firecrawl API key when prompted for the first, and a generated random secret for the second:

```bash
openssl rand -hex 32
```

- [ ] **Step 4: Deploy**

```bash
npx vercel --prod
```

Expected: deployment succeeds and prints a production URL.

- [ ] **Step 5: Verify the deployed cron route manually once**

```bash
npx vercel env pull .env.production.local --environment=production
source .env.production.local
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<your-deployment-url>/api/cron/sync-flyers
```

Expected: JSON response with `storesProcessed` close to 82.

(Vercel Cron itself will begin invoking this route automatically once daily per `vercel.json`'s schedule — no further action needed for that to start running.)

- [ ] **Step 6: Update `readme.md`**

Replace its contents with:

```markdown
# Comodi Iida Flyer Map

Daily-refreshed map of current Comodi Iida store promotion flyers.

- Design: `docs/superpowers/specs/2026-06-22-comodi-iida-flyer-map-design.md`
- Plan: `docs/superpowers/plans/2026-06-22-comodi-iida-flyer-map.md`

## Local development

\`\`\`bash
docker run -d --name superpromo-dev-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16
cp .env.example .env.local  # fill in FIRECRAWL_API_KEY, POSTGRES_URL, CRON_SECRET
npm install
npm run dev
\`\`\`

## Deployment

Deployed on Vercel. Postgres and Blob are provisioned via the Vercel
Postgres/Blob integrations. The daily sync runs via Vercel Cron
(`vercel.json`), hitting `/api/cron/sync-flyers`.
```

- [ ] **Step 7: Commit**

```bash
git add readme.md
git commit -m "Document local development and deployment setup"
```

---

## Self-Review Notes

- **Spec coverage:** architecture (Task 5, 8), data model (Task 3), cron discovery/scrape/diff/error-isolation (Task 4), frontend map/search/responsive-viewer (Tasks 6–8), Firecrawl/Blob/Postgres integration details (Task 5), setup/git note from the spec (already done prior to this plan; Task 10 covers Vercel-specific setup). All spec sections have a corresponding task.
- **Type consistency:** `StoreWithFlyers` (Task 3) flows into `Store` (Task 8) and `SearchableStore` (Task 7) consistently; `FirecrawlClient`/`BlobClient` interfaces defined in Task 4 are implemented identically in Task 5's route. `tokubaiImageId`/`blobUrl` field names are consistent across Tasks 3, 4, 6, 8.
- **No placeholders:** every step has runnable code or exact commands; no TODOs.
