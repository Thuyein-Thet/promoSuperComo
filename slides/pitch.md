---
marp: true
paginate: true
transition: fade
# PechaKucha: 6 slides, 20s auto-advance. Do not change the count.
auto-advance: 20
---

<!-- slide 1 -->
# Who's my person?
Anyone shopping Comodi Iida in Japan who wants to check
this week's flyer deals before heading to the store —
without digging through Tokubai store-by-store.
<!-- 20s -->

---

<!-- slide 2 -->
# Their problem
Tokubai lists each of Comodi Iida's ~82 stores on its own
page. There's no single place to browse "what's on sale
near me" across the whole chain, on a map, today.

---

<!-- slide 3 -->
# What I built
A self-updating map: all 82 stores as clustered pins,
search by name/address, click a pin to see that store's
current flyer images — synced daily, stale flyers pruned.

---

<!-- slide 4 -->
# How I built it
- MCP: GitHub server (`.mcp.json`) for repo/PR operations
- Skill: `frontend-design` for the visual redesign;
  `writing-plans` / `executing-plans` / `TDD` to drive
  10 tasks to real, tested commits
- Agent: `flyer-sync-debugger` — caught a pagination bug
  (20 vs. 82 stores) and a Blob-overwrite deadlock that no
  unit test could see, only live-data verification

---

<!-- slide 5 -->
# Why it matters
Cost went from ~500 Firecrawl credits/sync to $0 (plain
`fetch`+`cheerio`). Real-data debugging — not just green
tests — found bugs that would've quietly broken the app
in production: undercounted stores, images that 404'd,
a recovery deadlock, and dev data getting wiped by `npm test`.

---

<!-- slide 6 -->
# Done checklist
- [x] repo public
- [x] MCP + skill + agent used
- [x] report.md in team repo
