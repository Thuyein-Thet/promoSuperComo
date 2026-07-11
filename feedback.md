# User Feedback — Comodi Iida Flyer Map

- **How collected:** Hands-on test session against the live site (https://comodi-iida-flyer-map.vercel.app), acting as a real first-time visitor — desktop and mobile (390×844) viewports, using search, clusters, and pin popups.
- **When:** 2026-07-11

## Raw feedback

1. Loaded the homepage cold: map renders fast, all 82 stores are visible as clustered pins immediately, no loading flicker. Good first impression.
2. Searched "新宿" (a real Tokyo ward) expecting some result — got 0 stores and every pin silently vanished from the map, with no message telling me why. My first reaction was "is this broken, or is it still loading?" — I only found out later there's genuinely no store there. There's no empty state at all.
3. Searched "川口" (a real store area) — worked well, filtered to 12 matching stores, cluster counts updated correctly.
4. Clicked into a cluster down to an individual pin on desktop — the popup showed the store name and current flyer images cleanly, no dead links, no broken images.
5. On mobile (390px wide), the "82店舗" store-count text next to the search box is completely gone — not just visually clipped, it's absent from the page entirely at that width. First-time mobile users lose the one piece of UI that confirms "yes, data loaded, here's how many stores."
6. Mobile bottom-sheet for a store pin worked well: tapped a solo marker, got a clean sheet with store name, flyer thumbnails, and a close (×) button. No janky animation, no double-tap issue.
7. One dev-console accessibility warning: the search `<input>` has no `id`/`name` attribute (minor, doesn't affect end users directly, but worth a quick fix for form autofill/a11y tooling).

## Themes (what keeps coming up)

- Core browsing flow (map → cluster → pin → flyer) is solid on both desktop and mobile — no bugs found there.
- The app doesn't communicate state well at the edges: a zero-result search looks identical to a broken app, and the mobile layout drops a piece of status UI (store count) rather than reflowing it.

## Top 3 things to fix

- [ ] Add an empty-state message when search matches 0 stores (e.g. "該当する店舗が見つかりません" instead of a silently empty map)
- [ ] Fix the mobile layout so the "N店舗" count is still visible/reachable at narrow widths, not dropped
- [ ] Add an `id`/`name` attribute to the search `<input>` to clear the console a11y warning
