# pvzhtbot-mod

A client-side Tampermonkey mod for [pvzhtbot.com](https://pvzhtbot.com), a
Plants vs Zombies Heroes community deckbuilding/card-database site. It adds
a few features the site itself doesn't have, by reading the site's own API
and injecting UI into its dashboard — no server of its own, no account
credentials ever touched by the script.

## What it does

Once installed, a **"Mod Settings"** card appears on your `/dashboard`
alongside the site's own cards. From there you can enable/disable each
plugin. Three ship by default:

- **Collection Completion Tracker** — on `/dashboard/card-manager`, shows
  what % of all normal cards you own, plus a separate **4x-playset
  completion %** (the site only tells you what you own, not what you own
  *enough* of). Includes a rarity/set breakdown matrix and lists of
  fully-missing and under-4x cards. Updates live the moment you add/remove
  a card — no page refresh needed.
- **Deck Buildability Helper** — a dashboard card that ranks every public
  community deck by what % of it you can already build from your
  collection, with filters (All / Can build / Close 70%+), search, and
  click-to-expand deck details showing exactly which cards you're missing.
- **Hero Reference** — makes the site's hero/superpower data actually
  searchable (the site's own `/heroinfo` page is just a static image grid).
  Search by hero name, superpower name, or any word in an effect's text.

Everything is read-only against your account — the mod never adds,
removes, or changes any card, deck, or profile data on its own. (A manual
per-card "add to collection" helper exists in the API layer for future use
but isn't wired into any UI yet.)

## Installing

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser
   extension.
2. Open `userscript/dist/pvzhtbot-mod.user.js` in this repo, copy its
   contents.
3. Tampermonkey dashboard → **Create a new script** → paste → save.
4. Visit `https://pvzhtbot.com/dashboard` — you should see a "Mod
   Settings" card.

No build step required to just use it — `dist/pvzhtbot-mod.user.js` is
the ready-to-install bundle.

## Repo layout

- **`userscript/`** — the actual mod: core loader, plugin manager,
  settings UI, and the plugins above. See `userscript/README.md` for
  architecture details and the dev loop (auto-rebuild + auto-reload).
- **`site-research/`** — API discovery notes: which endpoints exist, their
  confirmed request/response shapes, and what's still unknown. This is
  the source of truth the userscript's API wrapper is built against —
  every endpoint the mod calls was observed in a live capture first, never
  guessed.

## Development

```
cd userscript
npm install
npm run build   # one-off build -> dist/pvzhtbot-mod.user.js
npm run dev     # watch + rebuild + local server, for live-reload dev loop
```

See `userscript/README.md` for the full dev-loop setup (a separate tiny
`dev-loader.user.js` script for auto-reloading during development).

## Project principles

This mod was built API-first and safety-conscious: no endpoint guessing,
no brute-forcing, no bulk write operations, no destructive actions without
the user directly present and approving, and the script never sees or
touches login credentials — auth is handled by your existing browser
session with the site.
