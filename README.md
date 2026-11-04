# 🌱 Greenhouse

**An unofficial, plugin-based client mod for [pvzhtbot.com](https://pvzhtbot.com)**
(Tbot, the Plants vs. Zombies Heroes deck/card database) — think Vencord,
but for Tbot. A Tampermonkey userscript with a plugin loader, a settings
panel, and a growing set of quality-of-life plugins the site doesn't have.

> [!WARNING]
> **Unofficial and not affiliated with pvzhtbot.com / Tbot or its owner.**
> **Using Greenhouse violates pvzhtbot.com's Terms of Service.** Section 07
> of the ToS says users may not "make mods of my site, add new features …
> without permission", and section 10 lets the owner restrict access to
> accounts. Permission was asked for and not given. Use it at your own
> risk — your Tbot account could be restricted.
>
> Plants vs. Zombies Heroes and all related names and art belong to
> Electronic Arts / PopCap. Greenhouse ships none of the site's code,
> data, or art; it reads the same API your browser already uses when you
> visit the site, from your own logged-in session.

## Plugins

Open the **🌱 Greenhouse** card on your `/dashboard` to toggle plugins and
change their settings (⚙).

| Plugin | What it does |
|---|---|
| **Card Quick Search** | `Ctrl+K` on any page: searches every card by name, alias, tribe, trait or ability text, with stats and how many you own. Hotkey is configurable. |
| **Keep or Scrap Advisor** | Checks the site's Keep or Scrap guide against your collection: which recommended cards (especially *Craft* picks) you're still missing, per class. |
| **Collection Completion Tracker** | On the Card Manager page: % of all cards owned, a separate 4x-playset %, a rarity × set matrix, and lists of missing / under-4x cards. Updates live as you edit. |
| **Deck Buildability Helper** | Ranks every community deck by how much of it you can build right now, with exactly which cards you're missing. |
| **Hero Reference** | A searchable hero + superpower lookup (the site's hero page is a static image grid). |
| **Crash Handler** *(core, always on)* | If a plugin crashes it tells you, and it auto-disables any plugin that keeps failing or freezes the page, so one broken plugin can't break the site for you. |
| **Update Checker** *(core, always on)* | Tells you when a newer Greenhouse build is out. |

Everything is **read-only** against your account: no plugin adds, removes
or changes cards, decks, or profile data.

## Installing

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the direct install link below
   (Tampermonkey shows an install screen), or paste the file into *Create a new script*.
3. Visit `https://pvzhtbot.com/dashboard`, where you'll see the 🌱 Greenhouse card.

**Updates are automatic.** Every build pushed here gets a newer version
number, and Tampermonkey picks it up on its own (daily by default; force
it with Tampermonkey → Utilities → *Check for userscript updates*).
Greenhouse also checks hourly and shows an **Update now** banner when
you're behind.

Direct install link:
`https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist/pvzhtbot-mod.user.js`

Upgrading from the old "PvZHTBot Mod" install: Tampermonkey's auto-update
handles it. If you paste the new version in by hand and end up with
both, delete the old one. (If both run anyway, Greenhouse notices and
only loads once.)

## Repo layout

- **`userscript/`** — Greenhouse itself: core loader, plugin manager,
  settings UI, and plugins. See [`userscript/README.md`](userscript/README.md)
  for the architecture and the hot-reload dev loop.
  - `src/plugins/` — built-in plugins (one folder each, auto-discovered)
  - `src/userplugins/` — your own plugins (same format, auto-discovered)
  - `archive/` — retired plugins kept as history; **never** compiled in
- **`site-research/`** — API notes: which endpoints exist, their
  confirmed shapes, and what's still unknown. Plugins are only built on
  endpoints documented as confirmed here.
- **`dev/`** — paste-into-console debug scripts.

## Writing a plugin

Make a folder, export a plugin, and you're done. The build finds it on its own:

```js
// userscript/src/userplugins/my-plugin/index.js
import { definePlugin } from '../../core/define-plugin.js';

export default definePlugin({
  id: 'my-plugin',
  name: 'My Plugin',
  description: 'One line shown in settings.',
  options: {
    loud: { type: 'boolean', label: 'Be loud', default: false },
  },
  async init(ctx) {
    ctx.log(`hello, loud=${ctx.options.store.loud}`);
    return () => { /* cleanup when disabled */ };
  },
});
```

Full guide: [`userscript/src/userplugins/README.md`](userscript/src/userplugins/README.md).

## Development

```
cd userscript
npm install
npm run build   # one-off build -> dist/pvzhtbot-mod.user.js
npm run dev     # watch + rebuild + local server, auto-reloads the open tab
```

## Project principles

API-first and careful: no guessed endpoints, no brute-forcing, no bulk
writes, nothing destructive, and the script never sees or touches login
credentials (auth is your existing browser session).
