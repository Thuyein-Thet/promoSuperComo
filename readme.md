# Comodi Iida Flyer Map

A map of current promotion flyers for all Comodi Iida supermarket stores, scraped from [Tokubai](https://tokubai.co.jp/) and kept up to date on a schedule.

- Design: [`docs/superpowers/specs/2026-06-22-comodi-iida-flyer-map-design.md`](docs/superpowers/specs/2026-06-22-comodi-iida-flyer-map-design.md)
- Plan: [`docs/superpowers/plans/2026-06-22-comodi-iida-flyer-map.md`](docs/superpowers/plans/2026-06-22-comodi-iida-flyer-map.md)

## How it works

- A cron route (`/api/cron/sync-flyers`) discovers all ~82 Comodi Iida stores by walking Tokubai's paginated store-list pages, then visits each store's page to read its name, address, coordinates, and current flyer images.
- Pages are fetched directly with `fetch()` and parsed with `cheerio` — no third-party scraping API, no per-request cost.
- Flyer images are re-uploaded to Vercel Blob; store and flyer records are stored in Postgres. Flyers no longer posted by a store are deleted (both the DB row and the Blob object) — only current flyers are kept.
- The home page renders a Leaflet map with clustered store markers, a search box, and click-to-view flyers (a popup on desktop, a bottom sheet on mobile).

## Local development

```bash
# Postgres (only needed once; any local Postgres 16 works, e.g. `brew install postgresql@16`)
createdb comodi_iida_dev
createdb comodi_iida_test

cp .env.example .env.local        # fill in POSTGRES_URL (comodi_iida_dev), BLOB_READ_WRITE_TOKEN, CRON_SECRET
cp .env.test.example .env.test    # POSTGRES_URL pointed at comodi_iida_test
npm install
npm run dev
```

The test suite truncates its database between runs (see `beforeEach`/
`afterEach` in `src/lib/*.test.ts`), so it always connects to whatever
`POSTGRES_URL` is in `.env.test` — loaded by `vitest.setup.ts` with
`override: true`, regardless of what's exported in your shell or set in
`.env.local`. Keep `.env.test` pointed at a database you don't mind being
wiped on every `npm test` run, separate from the one the dev server uses.

Trigger a sync manually:

```bash
curl -H "Authorization: Bearer <your CRON_SECRET>" http://localhost:3000/api/cron/sync-flyers
```

### Running tests

```bash
npm test
```

## Deployment

Deployed on Vercel at https://comodi-iida-flyer-map.vercel.app, linked to
this GitHub repo. Postgres (via the Neon integration) and Blob are both
provisioned and connected to the project. The daily sync runs via Vercel
Cron (`vercel.json`), hitting `/api/cron/sync-flyers`.

Required environment variables in production:

| Variable | Purpose |
|---|---|
| `POSTGRES_URL` | Postgres connection string (from the Vercel Postgres/Neon integration) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob write access (from the Vercel Blob integration) |
| `CRON_SECRET` | Bearer token required to trigger `/api/cron/sync-flyers` |
