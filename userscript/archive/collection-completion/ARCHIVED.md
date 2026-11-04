# Collection Completion Tracker (`collection-completion`)

- **Archived:** 2026-11-04
- **Last shipped in:** commit `b94f7fe` (build `1793754737966`, v0.3.0.202611040112)
- **Reason:** superseded by a native site feature.

## What it did
On `/dashboard/card-manager`: a "Completion" stat (owned / total normal
cards), a separate 4x-playset %, a collapsible rarity × set breakdown
matrix, and lists of fully-missing and under-4x cards. Updated live on
any collection change via `core/collection-watcher.js`.

## Why it's obsolete
pvzhtbot.com now ships this itself on the Card Manager page (confirmed
live 2026-11-04): its own `.summary-item` "Completion  503 / 503 (100%)"
with a "4x playsets: …" line, its own `details.completion-panel`
"Completion breakdown" with a by-set/rarity grid, and a new "Missing"
tab next to "My Collection". With both running, the page showed every
one of these twice.

## Anything worth salvaging
- `core/collection-watcher.js` (live updates on any `user-cards/` write)
  started here and is still used by other plugins. It stays in `src/core/`.
- Normal-card universe from `cardinfo/`: exclude `set_rarity`
  `'Premium - Hero'` / `'Token'` and descriptions containing
  `'Superpower'`.
- Rarity normalization on the *first* hyphen only (`"Colossal-Super-Rare"`
  data bug).
- Floor, don't round, completion % (502/503 must not show 100%).
- Cache keyed to the build id, with fingerprint invalidation.

## Original design notes (from userscript/README.md)

On `/dashboard/card-manager`, adds a "Completion" stat box (matching the
site's own `.summary-item` styling next to "Unique Cards"/"Total Copies")
showing `owned / total normal cards (%)`, with a second line for
**4x-playset completion** (`owned-at-4x / total (%)`) — a distinct, more
useful metric than "do I own it at all," since a card you own 1 copy of
still shows as "owned" in the main stat but not in the playset one. The
percentage floors instead of rounds (502/503 now correctly shows 99%, not
a misleading 100% — caught and fixed after live testing surfaced it).
Below that, a collapsible breakdown: by rarity/set (progress bars), a
list of fully-missing cards grouped by side + class, and a separate list
of owned-but-under-4x cards with their current quantity. Built entirely
on confirmed endpoints (`getAllCardInfo`, `getMyCards`, `getClasses`,
`getAvailableCards`) — no writes, ever. Hero/Superpower cards are
correctly excluded since `available/` never returns them (confirmed live
during API research).

**Live updates, no page reload:** `src/core/collection-watcher.js`
monkey-patches `window.fetch` once per page load to detect any successful
write to `.../user-cards/...` (add, quantity change, or delete — whether
triggered by this plugin, another plugin, or the site's own Card Manager
Save/Delete buttons) and notifies subscribers. This plugin subscribes and
immediately recomputes when notified. Results are also cached in
`sessionStorage`, keyed by a fingerprint of `(unique card count, total
quantity)` so a stale cache is detected and discarded rather than shown —
this fixed a real bug caught during live testing where the tracker kept
showing 503/503 after a card had actually been removed.

**Breaking site change, fixed 2026-09-24:** the site owner reworked the
"Add Cards" flow server-side to show missing-card ratios. This changed
`user-cards/available/` in three ways: (1) the `side` query value for
Plants changed from `"Plant"` to `"Plants"` (Zombie stayed singular —
inconsistent between sides, confirmed live); (2) the response wrapped
into `{"authenticated","cards":[...]}` instead of a bare array; (3) most
importantly, the endpoint's own filtering changed from "return only
fully-unowned cards, each flagged `already_owned: boolean`" to "return
every card not at a full 4x playset (unowned OR under-4x), each with
`owned_quantity: number` instead" — a card fully at 4x is simply absent
now. Fixed by rebuilding the normal-card universe from `cardinfo/`
directly (excluding heroes/tokens/superpowers via `set_rarity ===
'Premium - Hero'`, `set_rarity === 'Token'`, or `description` containing
`'Superpower'` — verified against the live account, no other
no-quantity mystery cards exist) instead of relying on `available/`'s
exclusion list implicitly, since it can no longer be trusted to mean
"not a normal card." See `site-research/docs/cards.md` for the full
capture, and `dev/diff-available-vs-mycards.js` for a script that
independently re-verifies this math directly from the console.

**Cache keyed to build ID, not a hand-bumped version:** `CACHE_KEY`
includes `__PVZHTBOT_MOD_BUILD_ID__` (the same value `build.js` embeds
for dev-reload detection), so every rebuild automatically invalidates any
stale cached result — no more manually bumping a `-v1`/`-v2`/... suffix
and hoping to remember to do it. A one-time sweep on plugin init clears
old builds' leftover cache entries from `sessionStorage`.

**Rarity normalization:** the site's own `cardinfo/` data has at least
one inconsistently-formatted `set_rarity` string (`"Colossal-Super-Rare"`
on one card vs. `"Colossal - Super-Rare"` on every other card of that
rarity - see `../site-research/docs/cards.md`), which was silently
fragmenting the rarity breakdown into a spurious extra 1-card row. Fixed
by normalizing on the first hyphen only (the tier itself, e.g.
"Super-Rare", legitimately contains a hyphen that must NOT be touched).

**Rarity breakdown as a matrix, not a list:** rendered as a grid — sets
(Basic, Premium, Galactic, Colossal, Triassic) as rows, tiers (Common,
Uncommon, Rare, Super-Rare, Legendary) as columns, each cell showing
`owned/total` and color-coded (green = complete, amber = partial, red =
none owned, dark = that set/tier combo doesn't exist, e.g. Premium has no
Common tier). "Event" has no tier structure so it's rendered as its own
row spanning all tier columns (one merged cell, same styling/coloring as
every other cell) instead of a column that would be empty for every
other set.
