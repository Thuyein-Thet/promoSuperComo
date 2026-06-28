# Comodi Iida Flyer Map — Design

## Purpose

A self-updating web app that shows current promotion flyers for all Comodi
Iida supermarket stores (Tokubai-sourced), browsable on a map by store
location or by name search.

## Scope

- Chain: Comodi Iida only (~82 stores nationwide, as listed on Tokubai).
- Source: `tokubai.co.jp` (chain store-list page + per-store leaflet pages).
- Retention: current flyers only. Superseded/expired flyers are deleted
  (DB rows + Blob images), not archived.
- Hosting: Vercel (Next.js app, Vercel Postgres, Vercel Blob, Vercel Cron).

## Architecture

```
Vercel Cron (daily)
  -> /api/cron/sync-flyers  (serverless function)
       -> fetch() + cheerio: scrape chain store-list page (paginated) -> store IDs/URLs
       -> fetch() + cheerio: scrape each store's leaflet page (batched, concurrent)
       -> Vercel Blob: upload new/changed flyer images
       -> Vercel Postgres: upsert stores, upsert/delete flyers

Next.js frontend (/)
  -> Leaflet + OpenStreetMap, clustered markers, one per store
  -> Search box (store name / area)
  -> Click pin -> popup (desktop/tablet) or bottom panel (mobile)
       -> shows current flyer image(s) for that store
```

No separate backend service — the cron job and the frontend are both part
of the same Next.js app deployed on Vercel.

## Data Model (Vercel Postgres)

```sql
stores
  id               serial primary key
  tokubai_store_id text unique not null   -- e.g. "259321"
  name             text not null          -- e.g. "コモディイイダ 鹿浜店"
  address          text
  lat              double precision
  lng              double precision
  last_scraped_at  timestamptz

flyers
  id               serial primary key
  store_id         integer references stores(id) on delete cascade
  tokubai_image_id text not null          -- e.g. "9416450"
  blob_url         text not null          -- Vercel Blob URL
  valid_from       date
  valid_until      date
  updated_at       timestamptz default now()

  unique (store_id, tokubai_image_id)
```

A store has zero-to-many current flyers. There is no history table —
yesterday's flyer rows for a store are deleted once they no longer appear
in today's scrape.

## Cron Job Logic (`/api/cron/sync-flyers`)

Triggered once daily by Vercel Cron.

1. Scrape the Comodi Iida chain store-list page on Tokubai to get the
   current full set of store IDs + names + URLs. This list is
   re-discovered every run (not hardcoded), so newly opened stores are
   picked up and closed stores are naturally pruned in step 4.
2. Process stores in concurrent batches (e.g. 8 at a time) to keep total
   run time well inside Vercel's function timeout:
   - Scrape the store's Tokubai page for name, address, and lat/lng
     (parsed from the embedded Google Maps link).
   - Scrape the store's leaflet detail page(s) to get current flyer image
     URLs (using the `o=true` original-resolution parameter).
3. For each store, diff today's flyer image IDs against the DB:
   - New image ID → download, upload to Blob, insert `flyers` row.
   - Existing image ID → leave as-is (skip re-upload).
   - DB row with no matching image ID today → delete the Blob object and
     the `flyers` row.
4. Upsert the store's metadata (name/address/lat/lng/`last_scraped_at`).
5. **Error handling: best-effort.** If a single store's scrape fails
   (network error, page structure change, store removed), log it and
   continue to the next store. That store's existing flyers/rows are left
   untouched until a future run succeeds for it. The job as a whole does
   not abort on a per-store failure, and there is no alerting — failures
   are visible in Vercel's function logs only.

## Frontend

- **Map**: Leaflet + OpenStreetMap tiles (no API key required). Store
  markers use marker clustering — nearby stores (e.g. dense Tokyo wards)
  collapse into a numbered cluster badge until zoomed in far enough to
  separate.
- **Search**: a text input above/beside the map. Typing filters/matches
  against store name and address; matching pins are highlighted and the
  map pans/zooms to fit them.
- **Viewing a store's flyers** (click a pin):
  - Desktop/tablet: a map popup opens showing the store name and flyer
    thumbnail(s); clicking a thumbnail opens it full-size in a lightbox.
  - Mobile: a bottom sheet / side panel opens instead, showing the store
    name and full-size flyer image(s) directly — avoids a cramped popup
    on small screens.
- Responsive breakpoint: standard mobile vs. desktop/tablet split (exact
  px breakpoint decided during implementation, not load-bearing here).

## Integration Details

- **Scraping**: Tokubai's pages are plain server-rendered HTML, so no
  headless-browser/scraping API is needed. The cron route fetches pages
  directly with `fetch()` (a normal browser `User-Agent` header) and
  parses them with `cheerio`, selecting via CSS classes
  (`div[class^='shop_leaflet_index_card ']` for store cards, `a.shop_name`
  / `.address a[href*='maps']` for store detail, and the embedded
  `data-view-state` JSON for flyer images). Zero per-request cost; no API
  key. A single leaflet detail page's `data-view-state` lists every
  currently-active leaflet for that store, so only one leaflet page fetch
  per store is needed.
- **Vercel Blob**: flyer images are downloaded from Tokubai and
  re-uploaded to Blob, keyed as `flyers/${tokubaiStoreId}/${tokubaiImageId}.jpg`
  (store-scoped, since `tokubaiImageId` alone is not guaranteed unique
  across stores); the DB stores only the Blob URL. The frontend never
  hot-links Tokubai's CDN.
- **Vercel Postgres**: provisioned via the Neon marketplace integration
  (`vercel integration add neon`), wire-protocol compatible with the `pg`
  driver used by the app, both locally and in production via the same
  `POSTGRES_URL`.

## Out of Scope (explicitly not building)

- Other supermarket chains besides Comodi Iida.
- Flyer history/archive beyond the current set.
- OCR or structured extraction of flyer contents (prices/items) — flyers
  are stored and shown as images only.
- Alerting/notifications on cron failure.
- Authentication — the frontend is public/read-only.

## Setup Notes

- Deployed and running in production on Vercel at
  https://comodi-iida-flyer-map.vercel.app. See `readme.md` for local
  development and deployment details.
