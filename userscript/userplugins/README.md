# userplugins/

Drop your own plugins here. Each plugin gets its own folder:

```
userplugins/
├── manifest.js          <- registers your plugins with the loader (edit this)
├── README.md             <- this file
└── my-plugin/
    ├── index.js          <- required: exports the plugin object
    ├── styles.css         <- optional: anything else your plugin needs
    └── some-helper.js     <- optional: split code however you like
```

## Minimal plugin

`userplugins/my-plugin/index.js`:

```js
export const myPlugin = {
  id: 'my-plugin',                 // unique, kebab-case
  name: 'My Plugin',               // shown in the settings panel
  description: 'One line describing what it does.',
  defaultEnabled: false,           // starts off unless the user enables it

  async init(context) {
    // context = { api, backend, settings, log }
    // context.api is the confirmed Site API wrapper - see
    // ../src/api/site-api.js for every method available (read-only calls
    // like getMyCards()/getAllCardInfo()/getAllDecklists(), plus the one
    // confirmed write, setCardQuantity(), and addCard()/addCardsWithRateLimit()).
    //
    // Do whatever your plugin does here - inject DOM, read data, etc.

    return () => {
      // optional teardown, called when the plugin is disabled
    };
  },
};
```

Then register it in `userplugins/manifest.js`:

```js
import { myPlugin } from './my-plugin/index.js';
export const userPlugins = [myPlugin];
```

Rebuild (`npm run build` from `userscript/`, or keep `npm run dev` running
during development) and it shows up in the mod's settings panel like any
built-in plugin.

## One plugin depending on another as a base

If your plugin builds on another plugin's functionality, import from that
plugin's folder directly - it's just a normal ES module:

```js
// userplugins/my-extension/index.js
import { someHelper } from '../../src/plugins/collection-completion/index.js';
// or, for another userplugin:
import { sharedThing } from '../shared-base-plugin/index.js';
```

Only import what a plugin explicitly exports for reuse (most built-in
plugins currently only export their plugin object, not internal helpers -
if you need something exposed for reuse, that's worth asking for rather
than reaching into a plugin's private internals).

## What NOT to do

- Don't call unconfirmed/inferred API endpoints without checking
  `../../site-research/docs/api.md` first for their actual status.
- Don't perform bulk writes (loops of add/remove calls) without your own
  explicit rate limiting - see `addCardsWithRateLimit()` in the API
  wrapper for the pattern this project uses.
- Don't assume `context.backend` is configured - it throws a clear error
  if called with no backend URL set (see `../src/api/backend-client.js`).
  No backend exists yet; this is a seam for future use, not something
  currently available.
