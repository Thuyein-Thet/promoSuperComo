# Comodi Iida Flyer Map

A map of current promotion flyers for all Comodi Iida supermarket stores, scraped from [Tokubai](https://tokubai.co.jp/) and kept up to date on a schedule.

Live site: https://comodi-iida-flyer-map.vercel.app

- **Using the site:** [`USER_GUIDE.md`](USER_GUIDE.md)
- **Setup, architecture, tests, deployment:** [`DEVELOPER_GUIDE.md`](DEVELOPER_GUIDE.md)
- Design: [`docs/superpowers/specs/2026-06-22-comodi-iida-flyer-map-design.md`](docs/superpowers/specs/2026-06-22-comodi-iida-flyer-map-design.md)
- Plan: [`docs/superpowers/plans/2026-06-22-comodi-iida-flyer-map.md`](docs/superpowers/plans/2026-06-22-comodi-iida-flyer-map.md)

## How it works

- A cron route (`/api/cron/sync-flyers`) discovers all ~82 Comodi Iida stores by walking Tokubai's paginated store-list pages, then visits each store's page to read its name, address, coordinates, and current flyer images.
- Pages are fetched directly with `fetch()` and parsed with `cheerio` — no third-party scraping API, no per-request cost.
- Flyer images are re-uploaded to Vercel Blob; store and flyer records are stored in Postgres. Flyers no longer posted by a store are deleted (both the DB row and the Blob object) — only current flyers are kept.
- The home page renders a Leaflet map with clustered store markers, a search box, and click-to-view flyers (a popup on desktop, a bottom sheet on mobile).

## License

[MIT](LICENSE)
