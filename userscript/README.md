# pvzhtbot-mod (Tampermonkey userscript)

Client-side mod for pvzhtbot.com: core loader, plugin manager, settings
UI, and a growing set of feature plugins. Built on the confirmed API
behavior documented in `../site-research/docs/api.md`.

## Architecture

```
Tampermonkey (userscript-header.js)
    -> Core loader (src/core/loader.js)
        -> Site API wrapper (src/api/site-api.js)   -- confirmed endpoints only
        -> Backend client seam (src/api/backend-client.js)  -- unused until needed
        -> Settings store (src/core/storage.js)     -- GM_getValue/GM_setValue
        -> Collection watcher (src/core/collection-watcher.js) -- detects any
           user-cards/ write (this mod's or the site's own UI) so plugins
           can live-update without a page reload
        -> Plugin manager (src/core/plugin-manager.js)
            -> Built-in plugins (src/plugins/<name>/index.js)
            -> User-authored plugins (userplugins/manifest.js)
    -> UI
        -> Dashboard card (src/ui/dashboard-card.js) -- injects a "Mod Settings"
           card into pvzhtbot.com's own /dashboard grid, styled with the
           site's own CSS classes
        -> Settings panel (src/ui/settings-panel.js) -- lists/toggles plugins,
           opened only from that dashboard card (no floating button - see
           below)
```

### Plugin folder layout
Each plugin (built-in or user-authored) gets its own folder with an
`index.js` entry point, so it can have its own styles/helpers/sub-modules
without cluttering a shared directory, and so one plugin can cleanly
import from another's folder if it needs to build on it:

```
src/plugins/
├── collection-completion/
│   └── index.js
└── deck-buildability/
    └── index.js
userplugins/                 <- for anyone who wants to add their own
├── manifest.js               <- register your plugin(s) here
├── README.md                 <- format + how to depend on another plugin
└── <your-plugin>/
    └── index.js
```

See `userplugins/README.md` for the full plugin-authoring guide.

### Why no floating settings button
An earlier version had a floating ⚙ button as a fallback on pages without
the dashboard grid. Removed by design: settings are now reachable only
from the `/dashboard` "Mod Settings" card, matching the site's own
navigation instead of a persistent overlay on every page.

### Why a backend-client seam with nothing behind it
No feature currently needs server-side state — everything so far is
readable/writable through pvzhtbot.com's own API. `BackendClient` exists
so a future plugin's `context.backend` is always defined (throws a clear
error if called while unconfigured) instead of every plugin having to
special-case "no backend configured". Do not wire up a real backend until
a specific plugin genuinely needs one.

## Live dev loop (auto-rebuild + auto-refresh)

For active development, `dev-loader.user.js` is a tiny Tampermonkey script
that fetches the latest `dist/pvzhtbot-mod.user.js` **fresh on every page
load** via `GM_xmlhttpRequest` (not `@require`, which Tampermonkey caches
and does *not* refetch automatically — a common gotcha) and `eval()`s it.
The loaded bundle itself polls a `/build-id` endpoint and reloads the page
whenever a new build appears.

1. `npm run dev` — builds in watch mode and serves `dist/` on
   `http://127.0.0.1:8787`.
2. Paste `dev-loader.user.js` into Tampermonkey once (Dashboard → Create a
   new script → paste → save). Needs `GM_xmlhttpRequest` grant +
   `@connect 127.0.0.1` — already in the header.
3. Edit `src/`, save. The watcher rebuilds, the open pvzhtbot.com tab
   detects the new build within ~1.5s and reloads itself automatically.

No floating button — only the `/dashboard` "Mod Settings" card opens
settings, matching the site's own navigation instead of an overlay on
every page.

Stop `npm run dev` (or disable `dev-loader.user.js`) when you're done
developing. For normal (non-dev) use, install the real
`dist/pvzhtbot-mod.user.js` directly instead — no dependency on a local
server.

## Building

```
cd userscript
npm install
npm run build
```

Produces `dist/pvzhtbot-mod.user.js` — the Tampermonkey userscript header
(`userscript-header.js`) prepended to an esbuild bundle of everything
under `src/`.

## Installing / testing

1. Build (above).
2. Tampermonkey dashboard → Create a new script (or Utilities → Import
   File) → paste/import `dist/pvzhtbot-mod.user.js` → save.
3. Visit `https://pvzhtbot.com/dashboard` — a "Mod Settings" card appears
   in the dashboard grid alongside "My Decklists"/"My Card Collection";
   clicking it opens the plugin list panel with every registered plugin
   and an enable/disable toggle for each.
4. Console should log `[pvzhtbot-mod] loader ready` with no errors.

This exact flow was smoke-tested live against the real site (via browser
automation, executing the built bundle body under isolated
`*-TEST`-suffixed DOM ids/storage keys so it didn't collide with or leave
behind any real mod state) before being handed off — see conversation
history for details. Confirmed: dashboard card renders identically
alongside the site's native cards, opens the panel correctly, and the
panel correctly reports zero plugins.

## Plugins shipped

### Collection Completion Tracker (`src/plugins/collection-completion/index.js`)
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
Common tier). "Event" has no tier structure so it's a single line below
the grid instead of a column that would be empty for every other set.

### Deck Buildability Helper (`src/plugins/deck-buildability/index.js`)
Adds a "Deck Buildability" card to `/dashboard` (styled like the other
cards). Clicking it opens a centered panel ranking every public community
deck (`GET /decklists/`, 133 observed) by what % of its 12 cards you own
(`GET /user-cards/`), with filter tabs "All / Can build / Close (70%+)"
matching the counts the site's own `/decklists` "Collection" filter shows
natively (confirmed: that filter is entirely client-side, no API call —
see `site-research/docs/decklists.md`) — but centralized on the dashboard,
ranked, and showing exactly which cards are missing per deck instead of
requiring a page visit and per-deck inspection. Read-only, no writes.
Click any deck row to expand it in place: shows the deck's full
description text and its complete 12-card list (owned cards in white,
missing ones in red with `have/need`), click again to collapse. A search
box filters by deck name/hero/archetype/creator/card name (e.g. typing a
card name finds every deck that uses it). Results are paginated 50 at a
time with a "Show N more" button instead of a hard cutoff.

### Hero Reference (`src/plugins/hero-reference/index.js`)
Adds a "Hero Reference" card to `/dashboard`. The site's own `/heroinfo`
page is a static image grid with no search and no per-hero detail route
(confirmed via research: the single bulk `GET /heroinfo/` call already
contains every hero's full superpower text — there's nothing more to
fetch per hero). This plugin makes that data actually searchable: type a
hero name, superpower name, or any word from an effect's text, and
matching heroes expand to show their full parsed superpower list.

Superpower parsing follows the recipe in
`site-research/docs/heroes.md`: a hero's `ability` field concatenates all
its superpowers as blocks separated by `\r\n\r\n`, each block's first
line being the superpower name plus Discord-emoji class tags
(`<:ClassName:id>`). Blocks whose first line has no class tag are
token/reminder text (e.g. a conjured minion's stat line), not real
superpowers — flagged as `(token/reminder)` rather than hidden, since the
heuristic was only spot-checked against one hero during research. Emoji
tags are replaced with their readable name (`<:Health:...>` → `Health`)
both in the title and the effect body — the original research only
checked the title line; live testing here found the same raw-tag noise
throughout the body text too and fixed it there as well.

## Adding a plugin (future work, not yet done)

A plugin is a plain object registered via `pluginManager.register(...)`
in `src/core/loader.js`:

```js
const examplePlugin = {
  id: 'example-plugin',
  name: 'Example Plugin',
  description: 'One line shown in the settings panel.',
  defaultEnabled: false,
  async init(context) {
    // context = { api, backend, settings, log }
    // ... do something, e.g. mutate the DOM, read context.api.getMyCards() ...
    return () => { /* optional teardown when disabled */ };
  },
};
pluginManager.register(examplePlugin);
```

No plugins are registered in this phase. See conversation/project notes
for candidate feature ideas surfaced during site research (e.g. a
collection-completion tracker, since the site's own UI doesn't surface
"X% of normal cards owned" anywhere).

## Relationship to site-research/

`../site-research/` is the discovery-phase project: captured traffic,
`docs/api.md` (the spec this wrapper is built from), and a standalone
reference copy of the API wrapper
(`../site-research/scripts/site-api-wrapper.js`). `src/api/site-api.js`
here is the userscript-integrated copy — keep them in sync manually if
the API surface changes; `site-research/docs/api.md` is the source of
truth for what's actually confirmed vs. inferred vs. unknown.
