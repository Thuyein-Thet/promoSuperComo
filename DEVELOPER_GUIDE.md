# Developer Guide — Comodi Iida Flyer Map

Next.js 16 (App Router) app that scrapes Tokubai for Comodi Iida store and
flyer data, stores it in Postgres + Vercel Blob, and renders it as a
clustered Leaflet map.

## Architecture

- `src/app/page.tsx` — renders the `FlyerMap` client component.
- `src/components/FlyerMap.tsx` — map, clustering, search wiring, and the
  desktop popup / mobile bottom-sheet split (breakpoint at 768px).
- `src/components/StoreSearch.tsx` — client-side name/address filter.
- `src/components/FlyerViewer.tsx` — flyer thumbnail grid + full-size
  lightbox.
- `src/app/api/stores/route.ts` — returns all stores + their current
  flyers as JSON, consumed by `FlyerMap` on mount.
- `src/app/api/cron/sync-flyers/route.ts` — the scrape/sync job. Walks
  Tokubai's paginated store list, fetches each store's page with `fetch()`,
  parses it with `cheerio`, uploads flyer images to Vercel Blob, and
  upserts stores/flyers in Postgres. Flyers no longer posted are deleted
  (DB row + Blob object).
- `src/lib/` — DB access and sync logic, covered by `*.test.ts` files.

No third-party scraping API is used — just direct `fetch()` + `cheerio`.

## Prerequisites

- Node.js (see `package.json` engines / `.nvmrc` if present; otherwise any
  recent LTS works with Next.js 16)
- Local Postgres 16 (`brew install postgresql@16` on macOS)

## Setup

```bash
createdb comodi_iida_dev
createdb comodi_iida_test

cp .env.example .env.local        # fill in POSTGRES_URL, BLOB_READ_WRITE_TOKEN, CRON_SECRET
cp .env.test.example .env.test    # POSTGRES_URL pointed at comodi_iida_test

npm install
npm run dev                       # http://localhost:3000
```

| Env var | Used for |
|---|---|
| `POSTGRES_URL` | Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob read/write access |
| `CRON_SECRET` | Bearer token required by `/api/cron/sync-flyers` |

Get `BLOB_READ_WRITE_TOKEN` from the Vercel Blob integration on the linked
project (`vercel link` + `vercel env pull` works too, if you have access).

## Running a sync manually

The cron route is just an authenticated HTTP endpoint — trigger it directly
instead of waiting for the schedule:

```bash
curl -H "Authorization: Bearer <your CRON_SECRET>" http://localhost:3000/api/cron/sync-flyers
```

In production this runs daily via Vercel Cron (`vercel.json`, currently
`0 18 * * *` UTC), hitting the same route.

## Tests

```bash
npm test          # vitest run
npm run test:watch
```

`vitest.setup.ts` loads `.env.test` with `override: true`, so tests **always**
connect to whatever `POSTGRES_URL` is in `.env.test` regardless of your shell
env or `.env.local`. Tests truncate that database between runs
(`beforeEach`/`afterEach` in `src/lib/*.test.ts`) — keep `.env.test` pointed
at a database you don't mind being wiped.

## Lint / typecheck

```bash
npm run lint
npx tsc --noEmit
```

## Deployment

Deployed on Vercel: https://comodi-iida-flyer-map.vercel.app, linked to this
GitHub repo. Postgres (via the Neon integration) and Blob are provisioned
and connected to the project; required env vars are the same three listed
above, set in the Vercel project settings rather than `.env.local`.

## Useful references

- Design spec: `docs/superpowers/specs/2026-06-22-comodi-iida-flyer-map-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-22-comodi-iida-flyer-map.md`
- End-user behavior: [`USER_GUIDE.md`](USER_GUIDE.md)
