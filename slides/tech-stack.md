---
marp: true
paginate: true
transition: fade
# PechaKucha: 6 slides, 20s auto-advance. Do not change the count.
auto-advance: 20
---

<!-- slide 1 -->
# Tech stack
Next.js 16 (App Router, React 19) + TypeScript.
Postgres for store/flyer records, Vercel Blob for flyer
images, Leaflet/react-leaflet for the map. Scraping is
plain `fetch` + `cheerio` — no paid scraping API.
<!-- 20s -->

---

<!-- slide 2 -->
# Agent
`.claude/agents/flyer-sync-debugger.md` — a subagent scoped
to the sync pipeline (`sync-flyers` route → `sync.ts` →
`tokubai.ts` → `db.ts`). It reproduces against the real
Tokubai site instead of reasoning from code alone.

---

<!-- slide 3 -->
# Skill
`.claude/skills/frontend-design/SKILL.md` — used to drive
the Japanese-paper-and-hanko visual redesign of the map UI,
so styling decisions followed a real design system instead
of ad hoc CSS tweaks.

---

<!-- slide 4 -->
# Methodology
Superpowers `writing-plans` → `executing-plans` → TDD, with
a checked-in spec and plan (`docs/superpowers/specs`,
`docs/superpowers/plans`). 10 tasks, each landing as a
tested commit; `systematic-debugging` for real bugs.

---

<!-- slide 5 -->
# Trigger + commands
- **Skill trigger:** any UI/visual-design task → invoke
  `frontend-design` before writing CSS/markup.
- **Agent trigger:** sync misbehaves (missing stores, stale
  flyers, `storesFailed` entries) → dispatch
  `flyer-sync-debugger` to reproduce live, not guess.

---

<!-- slide 6 -->
# Done checklist
- [x] Skill + subagent used and proven (real commits)
- [x] Tech-stack deck (this file)
- [x] Feedback collected (ch5/)
- [x] report.md in team repo
