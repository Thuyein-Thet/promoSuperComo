# Report: Comodi Iida Flyer Map

## What it does

The app is a self-updating map of current promotion flyers for all ~82 Comodi
Iida supermarket stores in Japan. A daily cron job (`src/app/api/cron/sync-flyers/route.ts`)
discovers every store from Tokubai's paginated chain-listing page, scrapes
each store's name/address/coordinates/flyer images directly via `fetch()` +
`cheerio`, re-hosts the flyer images on Vercel Blob, and upserts everything
into Postgres — deleting flyers that are no longer current. The homepage
(`src/components/FlyerMap.tsx`) renders those stores as clustered pins on a
Leaflet/OpenStreetMap map with a name/address search box; clicking a pin opens
a popup (desktop) or bottom sheet (mobile) showing that store's current flyer
images in a lightbox.

## How I built it

I used a spec-first, plan-first workflow rather than asking Claude Code to
freestyle the implementation:

1. **Design spec** (`docs/superpowers/specs/2026-06-22-comodi-iida-flyer-map-design.md`)
   — wrote down scope, architecture, and data model before any code existed.
2. **Implementation plan** (`docs/superpowers/plans/2026-06-22-comodi-iida-flyer-map.md`)
   — broke the spec into 10 sequential tasks (scaffold → parsing → DB →
   sync orchestration → API routes → 3 UI components → manual E2E
   verification → deploy), each with explicit file lists, interfaces, and a
   TDD step (write failing test → implement → make it pass) before commit.
3. **Execution** — Claude Code worked through the plan task-by-task, running
   real test suites (Vitest against a real local Postgres container, not
   mocks, for the DB and sync layers) and committing after each green task.
4. **Course correction from real data, not just unit tests** — Task 9's
   manual end-to-end run against the live site surfaced bugs invisible to
   any mock: a Leaflet remount bug that broke first-click popups, a marker
   icon path bug specific to this Next.js/Turbopack setup, and — most
   significantly — a pagination bug that meant only 20 of 82 stores were
   ever being discovered. Each fix is recorded as a dated "Amendment" in the
   plan doc with what broke and how it was confirmed (commits `f9b4498`,
   `9cf3596`, `7fac5df`).
5. **Cost-driven architecture change** — after real usage burned ~500 of
   1,000 monthly Firecrawl credits in a single sync, I had Claude Code
   investigate whether Firecrawl's headless rendering was even necessary.
   It confirmed via `curl` that Tokubai serves plain server-rendered HTML,
   then rewrote the entire scrape layer onto native `fetch()` + `cheerio`
   (commit `5b49a41`), cutting ongoing cost to zero and incidentally making
   the parsers more precise (CSS selectors instead of fuzzy markdown regex).
6. My own role was setting scope/constraints up front (chain, retention
   policy, no auth, no OCR), reviewing each task's diff before letting it
   commit, and directing the two real-data investigations above (rate-limit
   bug, Firecrawl cost) that unit tests structurally could not have caught.

## MCP / Skill / Agent — which ones, and where each was used

- **`superpowers:writing-plans` skill** — used to turn the design spec into
  the task-by-task plan in `docs/superpowers/plans/2026-06-22-comodi-iida-flyer-map.md`,
  including the TDD-per-task structure and the "Self-Review Notes" amendment
  log at the bottom of that file.
- **`superpowers:executing-plans` / `superpowers:subagent-driven-development`
  skill** — used to drive implementation through the plan's checkboxes one
  task at a time, each ending in a real commit (see the 30-commit history
  below).
- **`superpowers:test-driven-development` skill** — enforced the
  write-failing-test → implement → pass cycle visible in every task (e.g.
  Task 2's `src/lib/tokubai.test.ts` written and run-to-fail before
  `src/lib/tokubai.ts` existed).
- **`frontend-design` skill** (`.agents/skills/frontend-design/SKILL.md`,
  pulled via `skills-lock.json` from `anthropics/skills`) — used for the
  visual redesign in commit `de67e3a` ("Redesign frontend with a
  Japanese-paper-and-hanko visual identity"), which produced the
  `*.module.css` files now alongside each component
  (`FlyerMap.module.css`, `FlyerViewer.module.css`, `StoreSearch.module.css`).
- **GitHub MCP server** (`.mcp.json`) — configured for repo/PR operations
  (`@modelcontextprotocol/server-github`, token injected from the
  environment, never hardcoded) — available for the deployment/PR step that
  follows this report.
- **No custom subagents (`.claude/agents/*.md`) were defined for this
  project** — the standard `Explore`/`general-purpose` agents were used ad
  hoc for codebase lookups, not a project-specific agent definition.

## Evidence

- `docs/superpowers/specs/2026-06-22-comodi-iida-flyer-map-design.md` — the
  design spec written before code.
- `docs/superpowers/plans/2026-06-22-comodi-iida-flyer-map.md` — the
  10-task plan, with a "Self-Review Notes" section at the bottom logging 8
  real amendments (each naming the bug, the fix, and how it was verified).
- `.mcp.json` — GitHub MCP server configuration (token referenced via
  `${GITHUB_PERSONAL_ACCESS_TOKEN}`, not inlined).
- `.agents/skills/frontend-design/SKILL.md` and `skills-lock.json` — the
  frontend-design skill pulled from `anthropics/skills` and its lockfile
  pin/hash.
- `.gitignore` — `.env`, `.env.*` (with `!.env.example` carved out) ignored
  from line 3 onward; `git log --all -- .env .env.local` returns no
  history — these files were never committed.
- `.env.example` — placeholder-only template (`POSTGRES_URL=`,
  `BLOB_READ_WRITE_TOKEN=`, `CRON_SECRET=`) checked into the repo instead of
  real values.
- `git log --oneline` — 30 commits, one logical change each, from
  `d0c29ab` (design spec) through `0b70d7e` (final readme update),
  including dedicated fix-only commits (`fa57208`, `f9b4498`, `9cf3596`,
  `7fac5df`) separate from the feature commits they correct.
- The vertical slice runs end-to-end locally today: `npm run dev` +
  `curl -H "Authorization: Bearer <CRON_SECRET>" /api/cron/sync-flyers`
  populates Postgres + Blob from the live site, and `/` renders those
  stores as clustered, searchable, clickable map pins — confirmed against
  real data (82/82 stores, 164 flyers, 0 failures) in the Task 9 amendment
  notes.

## Post-report amendments (live-data debugging, same class as Task 9)

After this report was first written, a fresh health check against the live
site surfaced two more bugs invisible to the unit tests — both fixed with a
failing test first, same discipline as the Task 9 fixes above:

- **Stale flyers never pruned after an upload failure** — in
  `processStore` (`src/lib/sync.ts`), the Blob upload loop ran *before*
  `deleteFlyersNotIn`, with no error handling. The first time any single
  image upload failed (e.g. a missing/invalid Blob credential), the
  exception skipped pruning entirely for that store, so its stale flyers
  would silently rot forever instead of just failing that sync cycle. Fixed
  by catching the upload error, always running the prune step, then
  re-throwing so the store still lands in `storesFailed`. Covered by a new
  test in `src/lib/sync.test.ts`: "still prunes stale flyers for a store
  whose new-image upload fails."
- **Blob uploads permanently deadlocked once Postgres and Blob storage fell
  out of sync** — `buildBlobClient.upload` in
  `src/app/api/cron/sync-flyers/route.ts` called `@vercel/blob`'s `put()`
  without `allowOverwrite: true`. The moment Postgres lost track of a flyer
  that still existed in Blob storage (observed firsthand: an `npm test` run
  truncated the same Postgres database the dev server was using, since both
  pointed at one `comodi_iida_test` database — see below), every re-sync
  failed for every store with "blob already exists," with no way to
  recover short of a code change. Fixed by passing `allowOverwrite: true`,
  since Blob storage is purely a derived cache keyed by
  `(storeId, imageId)` and should always reflect whatever the live source
  currently has.
- **Local dev and test suites silently shared one database** — `.env.local`
  pointed both the running app and `vitest` (via `src/lib/sync.test.ts`'s
  `beforeEach`/`afterEach` `TRUNCATE`) at the same `comodi_iida_test`
  database. Running `npm test` while the dev server held real synced data
  wiped that data. This is a setup gap rather than a code bug; the README's
  local-dev section now calls it out explicitly and recommends a dedicated
  dev database.

Also during this session: linked the repo to a Vercel project
(`comodi-iida-flyer-map`, connected to GitHub) and provisioned + connected a
public Vercel Blob store, replacing the broken `BLOB_READ_WRITE_TOKEN`-less
local setup. Confirmed end-to-end against the real store: 82 stores, 164
flyers, all served from real `*.public.blob.vercel-storage.com` URLs that
return `200`.

## What I'd do next

- **Deploy to Vercel (Task 10 of the plan is still open)** — the project is
  now linked to Vercel with a Blob store connected, but there's still no
  production deployment: no hosted Postgres reachable from Vercel (local
  Postgres only serves `npm run dev`), no production environment variables
  set in the Vercel project, and no `vercel --prod` run yet. The cron
  schedule in `vercel.json` is already in place and just needs a live
  deployment to start firing.
- **Add a regression test for the pagination bug** — the 20-vs-82-store
  undercount (plan amendment, "Correction post Task-9") was caught by a
  human running the app, not by any automated test. A test asserting
  `discoverAllStores` walks multiple `?page=N` pages until exhaustion would
  have caught this in CI instead of in production-shaped manual testing.
- **Separate the test and dev Postgres databases** — point local dev at its
  own database (e.g. `comodi_iida_dev`) distinct from whatever `vitest`
  truncates, so running the test suite can never again wipe real synced
  data out from under a running dev server.
