// Update Checker — required, always-on built-in plugin (see `required:
// true` in plugin-manager.js). Not shown as a toggle in settings, just a
// "Required" badge, since a stale/broken mod silently failing with no way
// to know an update exists is worse than one extra always-on plugin.
//
// Two separate update signals exist for this project, deliberately kept
// apart since they answer different questions:
//   1. Tampermonkey's own native @updateURL/@downloadURL mechanism
//      (userscript-header.js) - checks @version periodically, shows an
//      "update available" badge in the Tampermonkey UI itself. Only
//      trips on a real version bump, not every dev/prod rebuild.
//   2. This plugin - compares the currently RUNNING build's
//      __PVZHTBOT_MOD_BUILD_ID__ against the build id published in
//      dist/build-id.txt on GitHub's default branch. Catches "you're on
//      an old build" even between version bumps (e.g. after a same-day
//      hotfix rebuild that didn't warrant bumping @version), and shows
//      the notice right on the dashboard instead of requiring a trip to
//      the Tampermonkey extension icon.
//
// Read-only: fetches one small text file from raw.githubusercontent.com,
// nothing else. No page reload or install action is performed
// automatically - the user always clicks through to actually update.

const BUILD_ID_URL =
  'https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist/build-id.txt';
const INSTALL_URL =
  'https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist/pvzhtbot-mod.user.js';
const DEV_SERVER_BUILD_ID_URL = 'http://127.0.0.1:8787/build-id';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // once an hour is plenty for a manual-install userscript
const DISMISSED_KEY_PREFIX = 'pvzhtbot-mod-update-dismissed-';

const BANNER_ID = 'pvzhtbot-update-banner';
const STYLE_ID = 'pvzhtbot-update-banner-styles';

const STYLES = `
#${BANNER_ID} {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 999997;
  max-width: 320px;
  background: #14161a;
  border: 1px solid #2f5a3a;
  border-radius: 8px;
  padding: 12px 14px;
  color: #eee;
  font: 13px system-ui, sans-serif;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}
#${BANNER_ID} .pvzhtbot-update-title { font-weight: 600; color: #9be29b; margin-bottom: 4px; }
#${BANNER_ID} .pvzhtbot-update-body { color: #ccc; font-size: 12px; margin-bottom: 10px; }
#${BANNER_ID} .pvzhtbot-update-actions { display: flex; gap: 8px; justify-content: flex-end; }
#${BANNER_ID} button {
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}
#${BANNER_ID} .pvzhtbot-update-view { background: #1f6f3f; color: #fff; }
#${BANNER_ID} .pvzhtbot-update-dismiss { background: #262626; color: #ccc; }
`;

function injectStylesOnce() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function currentBuildId() {
  return typeof __PVZHTBOT_MOD_BUILD_ID__ !== 'undefined' ? __PVZHTBOT_MOD_BUILD_ID__ : null;
}

async function fetchLatestBuildId() {
  const res = await fetch(`${BUILD_ID_URL}?_=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`build-id.txt fetch failed with ${res.status}`);
  return (await res.text()).trim();
}

function showBanner(latestBuildId, log) {
  if (document.getElementById(BANNER_ID)) return;
  injectStylesOnce();

  const banner = document.createElement('div');
  banner.id = BANNER_ID;

  const title = document.createElement('div');
  title.className = 'pvzhtbot-update-title';
  title.textContent = 'PvZHTBot Mod update available';
  banner.appendChild(title);

  const body = document.createElement('div');
  body.className = 'pvzhtbot-update-body';
  body.textContent = 'A newer build is published on GitHub than the one currently running.';
  banner.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'pvzhtbot-update-actions';

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'pvzhtbot-update-dismiss';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', () => {
    try {
      sessionStorage.setItem(`${DISMISSED_KEY_PREFIX}${latestBuildId}`, '1');
    } catch {
      // best-effort
    }
    banner.remove();
  });

  const viewBtn = document.createElement('button');
  viewBtn.className = 'pvzhtbot-update-view';
  viewBtn.textContent = 'View on GitHub';
  viewBtn.addEventListener('click', () => {
    window.open(INSTALL_URL, '_blank', 'noopener,noreferrer');
  });

  actions.appendChild(dismissBtn);
  actions.appendChild(viewBtn);
  banner.appendChild(actions);

  document.body.appendChild(banner);
  log('[update-checker] showing update banner');
}

function wasDismissed(buildId) {
  try {
    return sessionStorage.getItem(`${DISMISSED_KEY_PREFIX}${buildId}`) === '1';
  } catch {
    return false;
  }
}

// Running against the local dev server (npm run dev) means this build was
// never published to GitHub, so it will ALWAYS differ from
// dist/build-id.txt there - that comparison is meaningless noise during
// active development, not a real "you're out of date" signal. Probed
// directly (same URL dev-reload.js polls) rather than trusting
// context.isDevMode(), which is only set after dev-reload.js's own first
// poll resolves - a plain flag read here could race ahead of that on the
// very first check.
async function isRunningAgainstDevServer() {
  try {
    const res = await fetch(DEV_SERVER_BUILD_ID_URL, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkOnce(context) {
  if (context.isDevMode?.() || (await isRunningAgainstDevServer())) {
    document.getElementById(BANNER_ID)?.remove();
    return;
  }

  const running = currentBuildId();
  if (!running) return; // no build id embedded (shouldn't happen outside dev eval contexts)

  try {
    const latest = await fetchLatestBuildId();
    if (latest && latest !== running && !wasDismissed(latest)) {
      showBanner(latest, context.log);
    }
  } catch (err) {
    // Network hiccup or GitHub rate limit - not worth surfacing to the
    // user, this is a best-effort background check.
    context.log(`[update-checker] check failed: ${err.message}`, 'error');
  }
}

const updateCheckerPlugin = {
  id: 'update-checker',
  name: 'Update Checker',
  description:
    'Checks GitHub for a newer build and shows a dashboard notice if this install is out of date. Always on (skipped automatically while running via the local dev server).',
  defaultEnabled: true,
  required: true,

  async init(context) {
    checkOnce(context);
    const intervalId = setInterval(() => checkOnce(context), CHECK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      document.getElementById(BANNER_ID)?.remove();
    };
  },
};

export { updateCheckerPlugin };
