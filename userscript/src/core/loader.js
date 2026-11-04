// Core loader: entry point wired up by the Tampermonkey userscript header.
// Responsibilities:
//   1. Build the shared context (API wrapper, backend seam, settings, logger)
//   2. Instantiate the PluginManager
//   3. Register every plugin - discovered automatically at build time from
//      src/plugins/*/index.js and src/userplugins/*/index.js (see the
//      `greenhouse:plugins` virtual module in build.js). No manual list.
//   4. Mount the settings panel UI
//   5. Start any plugins the user already has enabled

import { PvzhtbotApi } from '../api/site-api.js';
import { BackendClient } from '../api/backend-client.js';
import { SettingsStore } from './storage.js';
import { PluginManager } from './plugin-manager.js';
import { BRAND } from './brand.js';
import { createSettingsPanel } from '../ui/settings-panel.js';
import { mountDashboardCard } from '../ui/dashboard-card.js';
import { startDevReloadWatcher } from './dev-reload.js';
import { showToast } from '../ui/toast.js';
import discoveredPlugins from 'greenhouse:plugins';

// Shared across every userscript sandbox on the page (it's on the DOM),
// so if both the installed build and the dev loader are enabled, only
// the first one to run boots - instead of every plugin injecting twice.
const LOADED_ATTR = 'data-greenhouse-loaded';

function log(message, level = 'info') {
  const fn = level === 'error' ? console.error : console.log;
  fn(`${BRAND.logPrefix} ${message}`);
}

async function boot() {
  const settings = new SettingsStore();
  const api = new PvzhtbotApi();
  const backend = new BackendClient({ baseUrl: settings.get('backendUrl', null) });

  // Set true the moment the dev-reload watcher confirms a local dev
  // server is running (see startDevReloadWatcher below). Exposed as a
  // live getter, not a snapshot, since that confirmation can land after
  // some plugins have already started - update-checker reads this on
  // every periodic check, not just once at init.
  let devModeDetected = false;
  const context = { api, backend, settings, log, isDevMode: () => devModeDetected };
  const pluginManager = new PluginManager({ settings, context });

  for (const { plugin, folder, builtIn } of discoveredPlugins) {
    try {
      pluginManager.register(plugin, { folder, builtIn });
    } catch (err) {
      log(`could not register plugin from folder "${folder}": ${err.message}`, 'error');
    }
  }

  const panel = createSettingsPanel(pluginManager);
  mountDashboardCard(() => panel.open());
  // No floating fallback button by design: settings are only reachable
  // from the /dashboard card, matching the site's own navigation instead
  // of a persistent overlay on every page.

  await pluginManager.startEnabledPlugins();

  // __GREENHOUSE_DEV__ is replaced at build time (build.js `define`):
  // true for `npm run dev`, false for `npm run build` - release builds
  // drop this block entirely.
  if (__GREENHOUSE_DEV__) {
    startDevReloadWatcher(log, () => {
      devModeDetected = true;
    });
  }

  log(`ready - ${pluginManager.list().filter((p) => p.active).length} plugin(s) running`);
  warnIfLegacyScriptRunning();
  return { api, backend, settings, pluginManager };
}

// The pre-rename "PvZHTBot Mod" (<= 0.2.0) always creates a hidden
// #pvzhtbot-mod-settings-panel at boot. Greenhouse no longer uses that id,
// so if it exists, the old script is ALSO installed and running - which
// happens because Tampermonkey treats a renamed script as a new one
// instead of replacing it (seen live 2026-11-04). It predates the
// double-load guard, so tell the user to remove it. Checked after a delay
// since either script may run first.
const LEGACY_PANEL_ID = 'pvzhtbot-mod-settings-panel';

function warnIfLegacyScriptRunning() {
  setTimeout(() => {
    if (!document.getElementById(LEGACY_PANEL_ID)) return;
    log('the old "PvZHTBot Mod" script is also running - delete it in Tampermonkey', 'error');
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem('greenhouse-legacy-warned') === '1';
    } catch {
      // ignore
    }
    if (dismissed) return;
    showToast({
      kind: 'warn',
      title: 'Old "PvZHTBot Mod" is still installed',
      body:
        `${BRAND.name} replaced it, but Tampermonkey kept the old script because it was renamed. ` +
        'Both are running, which causes stale notices and duplicate/missing cards.\n\n' +
        'Open the Tampermonkey dashboard and delete "PvZHTBot Mod" (keep "Greenhouse").',
      timeoutMs: 0,
      actions: [
        {
          label: 'Got it',
          onClick: () => {
            try {
              sessionStorage.setItem('greenhouse-legacy-warned', '1');
            } catch {
              // ignore
            }
          },
        },
      ],
    });
  }, 3000);
}

const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

if (document.documentElement.hasAttribute(LOADED_ATTR)) {
  log(
    `another copy (${document.documentElement.getAttribute(LOADED_ATTR)}) already loaded on this page - skipping. ` +
      'Disable either the installed script or the dev loader in Tampermonkey.',
    'error'
  );
} else {
  const buildId = typeof __PVZHTBOT_MOD_BUILD_ID__ !== 'undefined' ? __PVZHTBOT_MOD_BUILD_ID__ : 'unknown';
  document.documentElement.setAttribute(LOADED_ATTR, `build ${buildId}`);
  const booted = boot();
  // Expose for debugging in the browser console.
  pageWindow.__greenhouse = { ...(pageWindow.__greenhouse || {}), boot: booted, buildId };
}
