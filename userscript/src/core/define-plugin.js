// definePlugin(): the one way to declare a plugin. Every
// src/plugins/<id>/index.js and src/userplugins/<id>/index.js must
// `export default definePlugin({...})` - build.js discovers those folders
// automatically at build time and bundles them in (see the
// `greenhouse:plugins` virtual module there), so there is no manifest or
// loader edit needed to add a plugin.
//
// Shape:
//   definePlugin({
//     id: 'kebab-case-id',          // required, unique, must match the folder name
//     name: 'Human Name',           // required, shown in settings
//     description: 'One line.',
//     authors: ['you'],             // optional, shown in settings
//     tags: ['decks'],              // optional, free-form
//     defaultEnabled: false,
//     required: false,              // true = always on, no toggle
//     priority: 0,                  // higher starts first (crash-handler uses 100)
//     dependencies: ['other-id'],   // enabling this force-enables these first
//     options: {                    // optional per-plugin settings, auto-rendered in the panel
//       showThing: { type: 'boolean', label: 'Show thing', default: true },
//       limit:     { type: 'number',  label: 'Max rows', default: 50, min: 1, max: 500 },
//       title:     { type: 'string',  label: 'Title', default: 'Hi' },
//       mode:      { type: 'select',  label: 'Mode', default: 'a',
//                    choices: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] },
//       // any option may also set `description` and `restartNeeded: true`
//     },
//     earlyInit(ctx) { ... },      // optional, SYNC: runs at document-start,
//                                  // before the site's scripts and the DOM
//                                  // (no document.body). For network hooks.
//     async init(ctx) { ... return teardownFn; },
//   });
//
// ctx = { api, backend, settings, log, isDevMode, plugins, options, events }
//   ctx.log        - already prefixed with the plugin id
//   ctx.options    - this plugin's settings: get(key), set(key, v), store.<key>,
//                    onChange((key, value) => {}) -> unsubscribe
//   ctx.plugins    - read-only-ish view of the plugin manager (list, isEnabled,
//                    setEnabled, on(event, cb)) - mostly for core plugins

const OPTION_TYPES = new Set(['boolean', 'number', 'string', 'select']);
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function definePlugin(plugin) {
  const where = plugin?.id ? `plugin "${plugin.id}"` : 'a plugin';
  if (!plugin || typeof plugin !== 'object') throw new Error('definePlugin() needs an object');
  if (!ID_RE.test(plugin.id || '')) throw new Error(`${where}: id must be kebab-case`);
  if (!plugin.name) throw new Error(`${where}: missing name`);
  if (typeof plugin.init !== 'function') throw new Error(`${where}: missing init()`);
  if (plugin.earlyInit != null && typeof plugin.earlyInit !== 'function') {
    throw new Error(`${where}: earlyInit must be a function`);
  }

  for (const [key, opt] of Object.entries(plugin.options || {})) {
    if (!OPTION_TYPES.has(opt?.type)) {
      throw new Error(`${where}: option "${key}" has invalid type "${opt?.type}"`);
    }
    if (!('default' in opt)) throw new Error(`${where}: option "${key}" needs a default`);
    if (opt.type === 'select' && !Array.isArray(opt.choices)) {
      throw new Error(`${where}: select option "${key}" needs choices[]`);
    }
  }

  return {
    description: '',
    authors: [],
    tags: [],
    defaultEnabled: false,
    required: false,
    priority: 0,
    dependencies: [],
    options: {},
    ...plugin,
  };
}

export { definePlugin };
