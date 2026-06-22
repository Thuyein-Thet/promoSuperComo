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
# Postgres (only needed once; reuse the same container across sessions)
docker run -d --name superpromo-dev-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:16

cp .env.example .env.local   # fill in POSTGRES_URL, BLOB_READ_WRITE_TOKEN, CRON_SECRET
npm install
npm run dev
```

Trigger a sync manually:

```bash
curl -H "Authorization: Bearer <your CRON_SECRET>" http://localhost:3000/api/cron/sync-flyers
```

### Running tests

```bash
npm test
```

## Deployment

Deployed on Vercel. Postgres is provisioned via the Vercel Postgres (Neon) integration; image storage via Vercel Blob. The sync job runs on a schedule configured in `vercel.json`, hitting `/api/cron/sync-flyers`.

Required environment variables in production:

| Variable | Purpose |
|---|---|
| `POSTGRES_URL` | Postgres connection string (from the Vercel Postgres/Neon integration) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob write access (from the Vercel Blob integration) |
| `CRON_SECRET` | Bearer token required to trigger `/api/cron/sync-flyers` |
