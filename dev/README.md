# dev/ — debug scripts

Paste-into-browser-console snippets for diagnosing API/site changes, like
the 2026-09-24 `available/` breaking change these were written to catch.

**How to use:** open `https://pvzhtbot.com/dashboard` (or any page on the
site) while logged in, open DevTools console (F12), paste the whole file's
contents, hit Enter. They use your existing session cookie — same as any
request the site itself makes — and never touch credentials directly.

All scripts here are **read-only** unless a script's own header says
otherwise (e.g. `net-zero-patch-test.js` does a real PATCH but restores
the original value immediately, same as the manual tests done in-session
so far). Never run a script here against a real card without reading what
it does first.

## Scripts

- **`snapshot-api-shapes.js`** — hits every confirmed endpoint once and
  dumps a compact summary of each response's top-level shape (keys,
  array-vs-object, a couple sample entries). Run this first whenever
  something in the mod looks wrong — it's the fastest way to see whether
  the SITE changed something out from under us, without touching the
  userscript at all. Compare its output against `site-research/docs/`.

- **`diff-available-vs-mycards.js`** — cross-references `available/`
  (swept across every side/class) against `user-cards/` (owned) and
  `cardinfo/` (all cards) to sanity-check completion math: how many cards
  are non-collectible (hero/token/superpower), how many are owned, how
  many are missing/under-playset. Useful for verifying the Completion
  Tracker's numbers independently of the mod's own code.

- **`net-zero-patch-test.js`** — picks one of your own owned cards at
  quantity 4, PATCHes it down by 1, reads back the response shape, then
  PATCHes it back to 4. Confirms the PATCH endpoint's request/response
  shape is still what `site-research/docs/cards.md` documents, with the
  collection left exactly as it started. Edit the `CARD_ID` constant at
  the top if you want to test a specific card (must be currently at
  quantity 4, or edit the restore-quantity line to match).

## Why these exist

Tbone changed the "Add Cards" flow server-side on 2026-09-24 (see PvZH
Discord #dev-chat) and it silently broke the Collection Completion
Tracker's math without throwing any error — the plugin just started
showing wrong numbers with a stale sessionStorage cache masking it
further. These scripts exist so a future site change can be diagnosed in
under a minute directly in a browser console, instead of needing a full
research/build cycle again.
