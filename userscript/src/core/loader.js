// Core loader: entry point wired up by the Tampermonkey userscript header.
// Responsibilities:
//   1. Build the shared context (API wrapper, backend seam, settings, logger)
//   2. Instantiate the PluginManager
//   3. Register built-in plugins (src/plugins/*/index.js) and
//      user-authored plugins (userplugins/manifest.js)
//   4. Mount the settings panel UI
//   5. Start any plugins the user already has enabled

import { PvzhtbotApi } from '../api/site-api.js';
import { BackendClient } from '../api/backend-client.js';
import { SettingsStore } from './storage.js';
import { PluginManager } from './plugin-manager.js';
import { createSettingsPanel } from '../ui/settings-panel.js';
import { mountDashboardCard } from '../ui/dashboard-card.js';
import { startDevReloadWatcher } from './dev-reload.js';
import { collectionCompletionPlugin } from '../plugins/collection-completion/index.js';
import { deckBuildabilityPlugin } from '../plugins/deck-buildability/index.js';
import { heroReferencePlugin } from '../plugins/hero-reference/index.js';
// User-authored plugins live in ../../userplugins/ (repo root, sibling to
// src/) and register themselves via userplugins/manifest.js - see
// userplugins/README.md for the format. This is the ONLY place a new
// userplugin needs to be added (edit the manifest, not this file).
import { userPlugins } from '../../userplugins/manifest.js';

const LOG_PREFIX = '[pvzhtbot-mod]';

function log(message, level = 'info') {
  const fn = level === 'error' ? console.error : console.log;
  fn(`${LOG_PREFIX} ${message}`);
}

async function boot() {
  const settings = new SettingsStore();
  const api = new PvzhtbotApi();
  const backend = new BackendClient({ baseUrl: settings.get('backendUrl', null) });

  const context = { api, backend, settings, log };
  const pluginManager = new PluginManager({ settings, context });

  pluginManager.register(collectionCompletionPlugin);
  pluginManager.register(deckBuildabilityPlugin);
  pluginManager.register(heroReferencePlugin);
  for (const plugin of userPlugins) {
    pluginManager.register(plugin);
  }

  const panel = createSettingsPanel(pluginManager);
  mountDashboardCard(() => panel.open());
  // No floating fallback button by design: settings are only reachable
  // from the /dashboard card, matching the site's own navigation instead
  // of a persistent overlay on every page.

  await pluginManager.startEnabledPlugins();

  startDevReloadWatcher(log);

  log('loader ready');
  return { api, backend, settings, pluginManager };
}

// Expose for debugging in the browser console, and so a future plugin
// bundle loaded separately could hook into the same instance if needed.
window.__pvzhtbotMod = { boot };

boot();
