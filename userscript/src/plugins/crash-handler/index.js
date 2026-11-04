// Crash Handler — required, always-on built-in plugin. Starts before
// every other plugin (priority 100) so it sees all of their startups.
//
// What it does:
//   1. Shows a toast whenever a plugin throws (init, teardown, or an
//      option-change listener), with "Copy details" for bug reports.
//   2. Auto-disables a plugin that fails to start N page loads in a row
//      (N = the `threshold` option), so one broken plugin - usually
//      because the site changed something under it - can't keep
//      erroring on every page forever.
//   3. Freeze/hang protection: right before a plugin starts it writes a
//      "starting <id>" marker to storage and clears it once that plugin
//      finishes starting (or on a normal reload/navigation). If the page
//      hung or died mid-start (infinite loop, tab killed), the marker
//      survives - the next load counts that as a failure toward the same
//      threshold, and disables the culprit before it can run again.
//   4. Keeps the last 25 crash reports in storage (see the crash log in
//      the console: `__greenhouse.crashLog()`).
//
// The plugin manager already isolates every plugin call in try/catch, so
// a crash never takes the loader or other plugins down with it; this
// plugin is the part that tells you about it and stops repeat offenders.

import { definePlugin } from '../../core/define-plugin.js';
import { showToast } from '../../ui/toast.js';
import { BRAND } from '../../core/brand.js';

const STATE_KEY = 'crashHandler';
const MAX_LOG = 25;

function readState(settings) {
  return { pending: null, failStreak: {}, log: [], ...(settings.get(STATE_KEY, {}) || {}) };
}

function writeState(settings, state) {
  settings.set(STATE_KEY, state);
}

function pushLog(state, entry) {
  state.log = [entry, ...(state.log || [])].slice(0, MAX_LOG);
}

function formatReport(entry) {
  return [
    `${BRAND.name} crash report`,
    `plugin: ${entry.id}`,
    `phase: ${entry.phase}`,
    `when: ${entry.at}`,
    `page: ${entry.page}`,
    `build: ${entry.build}`,
    `error: ${entry.message}`,
    '',
    entry.stack || '(no stack)',
  ].join('\n');
}

function copy(text) {
  try {
    navigator.clipboard?.writeText(text);
  } catch {
    // clipboard can be blocked; the console log below is the fallback
  }
  console.info(text);
}

export default definePlugin({
  id: 'crash-handler',
  name: 'Crash Handler',
  description:
    'Catches plugin crashes, tells you about them, and auto-disables a plugin that keeps failing or freezes the page.',
  required: true,
  defaultEnabled: true,
  priority: 100,
  tags: ['core'],
  options: {
    autoDisable: {
      type: 'boolean',
      label: 'Auto-disable crashing plugins',
      description: 'Turn a plugin off after it fails to start several page loads in a row.',
      default: true,
    },
    threshold: {
      type: 'number',
      label: 'Failures before auto-disable',
      default: 2,
      min: 1,
      max: 10,
    },
    showToasts: {
      type: 'boolean',
      label: 'Show crash notifications',
      default: true,
    },
  },

  async init(ctx) {
    const { settings, plugins, options, log } = ctx;
    const build = typeof __PVZHTBOT_MOD_BUILD_ID__ !== 'undefined' ? __PVZHTBOT_MOD_BUILD_ID__ : 'unknown';

    // --- 3. hang protection: a marker left over from the previous load ---
    // A normal reload/navigation fires `pagehide` (cleared below), so a
    // surviving marker means the page died or froze mid-start. It counts
    // toward the same failure threshold as a thrown error, so a single
    // odd case (browser crash, killed tab) never disables anything alone.
    const state = readState(settings);
    if (state.pending && state.pending !== 'crash-handler') {
      const culprit = state.pending;
      const info = plugins.list().find((p) => p.id === culprit);
      const entry = {
        id: culprit,
        phase: 'freeze',
        message: 'The page froze or closed while this plugin was starting.',
        stack: '',
        at: new Date().toISOString(),
        page: location.pathname,
        build,
      };
      pushLog(state, entry);
      state.pending = null;
      state.failStreak[culprit] = (state.failStreak[culprit] || 0) + 1;
      const shouldDisable =
        info && !info.required && options.get('autoDisable') && state.failStreak[culprit] >= options.get('threshold');
      if (shouldDisable) delete state.failStreak[culprit];
      writeState(settings, state);
      if (shouldDisable) {
        // Not awaited: setEnabled() persists the "off" flag synchronously,
        // which is all that's needed for startEnabledPlugins() to skip it.
        plugins.setEnabled(culprit, false).catch(() => {});
        showToast({
          kind: 'error',
          title: `${info.name} was disabled`,
          body: 'It froze or crashed the page while starting, more than once. Re-enable it from settings once it\'s fixed.',
          timeoutMs: 0,
          actions: [
            { label: 'Copy details', onClick: () => copy(formatReport(entry)) },
            { label: 'Re-enable', onClick: () => plugins.setEnabled(culprit, true) },
          ],
        });
      }
    } else if (state.pending) {
      state.pending = null;
      writeState(settings, state);
    }

    const offs = [];

    const onPageHide = () => {
      const s = readState(settings);
      if (s.pending) {
        s.pending = null;
        writeState(settings, s);
      }
    };
    window.addEventListener('pagehide', onPageHide);
    offs.push(() => window.removeEventListener('pagehide', onPageHide));

    offs.push(
      plugins.on('plugin:starting', ({ id }) => {
        const s = readState(settings);
        s.pending = id;
        writeState(settings, s);
      })
    );

    offs.push(
      plugins.on('plugin:started', ({ id }) => {
        const s = readState(settings);
        if (s.pending === id) s.pending = null;
        if (s.failStreak[id]) delete s.failStreak[id];
        writeState(settings, s);
      })
    );

    // --- 1 + 2. report crashes, auto-disable repeat init failures ---
    offs.push(
      plugins.on('plugin:error', ({ id, phase, error }) => {
        const s = readState(settings);
        if (s.pending === id) s.pending = null;

        const entry = {
          id,
          phase,
          message: error?.message || String(error),
          stack: error?.stack || '',
          at: new Date().toISOString(),
          page: location.pathname,
          build,
        };
        pushLog(s, entry);

        let disabled = false;
        if (phase === 'init') {
          s.failStreak[id] = (s.failStreak[id] || 0) + 1;
          const info = plugins.list().find((p) => p.id === id);
          if (options.get('autoDisable') && !info?.required && s.failStreak[id] >= options.get('threshold')) {
            delete s.failStreak[id];
            disabled = true;
          }
        }
        writeState(settings, s);

        if (disabled) {
          plugins.setEnabled(id, false).catch(() => {});
          log(`auto-disabled ${id} after repeated startup failures`, 'error');
        }

        if (options.get('showToasts')) {
          const name = plugins.list().find((p) => p.id === id)?.name || id;
          showToast({
            kind: 'error',
            title: disabled ? `${name} crashed and was disabled` : `${name} crashed`,
            body: `${phase}: ${entry.message}`,
            timeoutMs: disabled ? 0 : 10000,
            actions: [
              { label: 'Copy details', onClick: () => copy(formatReport(entry)) },
              ...(disabled
                ? [{ label: 'Re-enable', onClick: () => plugins.setEnabled(id, true) }]
                : []),
            ],
          });
        }
      })
    );

    // Console helpers for debugging / bug reports.
    const api = {
      crashLog: () => readState(settings).log,
      clearCrashLog: () => {
        const s = readState(settings);
        s.log = [];
        s.failStreak = {};
        writeState(settings, s);
      },
    };
    // unsafeWindow = the real page window under Tampermonkey, so these
    // are reachable from the normal devtools console.
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    pageWindow.__greenhouse = { ...(pageWindow.__greenhouse || {}), ...api };

    return () => offs.forEach((off) => off());
  },
});
