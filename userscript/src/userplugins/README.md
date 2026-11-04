# src/userplugins/

Your own Greenhouse plugins go here. **Each folder is picked up
automatically at build time.** There's no manifest or loader file to
edit. (Built-ins in `src/plugins/` work exactly the same way.)

```
src/userplugins/
├── README.md               <- this file
├── my-plugin/
│   ├── index.js            <- required: `export default definePlugin({...})`
│   └── helpers.js          <- optional: split code however you like
└── _wip-thing/             <- folders starting with _ or . are skipped
```

Folder name = plugin `id` (the loader warns if they differ). In
`npm run dev`, adding or removing a folder triggers a rebuild and your
open tab reloads.

## Minimal plugin

```js
import { definePlugin } from '../../core/define-plugin.js';

export default definePlugin({
  id: 'my-plugin',                 // unique, kebab-case, same as the folder
  name: 'My Plugin',               // shown in the settings panel
  description: 'One line describing what it does.',
  authors: ['you'],
  defaultEnabled: false,

  async init(ctx) {
    // ... inject DOM, read data, etc.
    return () => {
      // teardown: called when the plugin is disabled. Undo everything.
    };
  },
});
```

## What `ctx` gives you

| | |
|---|---|
| `ctx.api` | The site API wrapper (`../api/site-api.js`) — confirmed endpoints only: `getMyCards()`, `getAllCardInfo()`, `getAllDecklists()`, `getKeepOrScrap()`, ... |
| `ctx.log(msg, level?)` | Console log, already prefixed with your plugin id. |
| `ctx.options` | Your plugin's settings (below). |
| `ctx.settings` | The raw global settings store. Prefer `ctx.options`. |
| `ctx.plugins` | `list()`, `isEnabled(id)`, `setEnabled(id, on)`, `on(event, cb)` — mostly for core plugins. |
| `ctx.isDevMode()` | True when running from the local dev server. |

## Settings (`options`)

Declare them and the settings panel renders them under your plugin's ⚙
button automatically:

```js
options: {
  showThing: { type: 'boolean', label: 'Show the thing', default: true },
  limit:     { type: 'number',  label: 'Max rows', default: 50, min: 1, max: 500 },
  title:     { type: 'string',  label: 'Title', default: 'Hi' },
  mode:      { type: 'select',  label: 'Mode', default: 'a',
               choices: [{ label: 'Mode A', value: 'a' }, { label: 'Mode B', value: 'b' }] },
  heavy:     { type: 'boolean', label: 'Heavy mode', default: false,
               description: 'Shown under the label.', restartNeeded: true },
},
```

Read them with `ctx.options.get('limit')` or `ctx.options.store.limit`.
Write with `ctx.options.set(...)`. React live with
`ctx.options.onChange((key, value) => ...)`, which returns an
unsubscribe function. `restartNeeded: true` shows the "refresh to apply"
notice when the user changes it.

## Other fields

- `dependencies: ['other-id']` — enabling yours enables those first;
  disabling one of them disables yours.
- `required: true` — always on, no toggle (core plugins only, please).
- `priority: 0` — higher starts first (crash-handler is 100).
- `tags: ['cards']` — searchable in the settings panel.
- `earlyInit(ctx)` — optional, **synchronous**. It runs at document-start,
  before the site's own scripts and before `document.body` exists. Use it
  only for things that must beat the site, like network hooks. `init`
  still runs later as usual, so make whatever you install idempotent
  (see `analytics-blocker`).

## Shared helpers

- `../../ui/dashboard-card.js` → `addDashboardTile({ id, label, action, onClick })`
  adds a site-styled card to `/dashboard` and returns a teardown function.
- `../../ui/modal.js` → `createModal({ id, title, width })` gives a
  Greenhouse-styled popup with `.body`, `.open()`, `.close()`, and Esc/backdrop close.
- `../../ui/toast.js` → `showToast({ title, body, kind, actions })`.
- `../../lib/card-text.js` → `cleanEmoji()` (Discord emoji tags → words),
  `parseStats()`, `normName()`, `createCardMatcher()` (typo-tolerant card-name lookup).
- `../../core/collection-watcher.js` → `onCollectionChanged(cb)` fires after
  any card add/edit/delete, from the site's own UI or a plugin.
- `../../core/brand.js` → `THEME` colors so your UI matches.
- `../../core/page-network.js` → `addRequestBlocker((url, kind) => bool)`
  and `addFetchHandler(({ url, method, passThrough }) => Promise<Response>|undefined)`
  hook the **page's** own requests. `pageFetch()` fetches through those hooks.

## Crashes

You don't need your own try/catch around `init`. If it throws, the
Crash Handler shows the user a toast. If it keeps failing on every page
load, or freezes the page while starting, it gets auto-disabled. In the
console, `__greenhouse.crashLog()` shows recent crashes with stacks.

## Rules

- Only call endpoints marked **CONFIRMED** in `../../../site-research/docs/api.md`.
  New endpoint? Observe the site calling it first, then document it.
- No bulk writes without explicit rate limiting (`addCardsWithRateLimit()`).
- Your teardown should remove everything you added (DOM, listeners, intervals).
- Retiring a plugin? Move it to `../../archive/`. See that folder's README.
