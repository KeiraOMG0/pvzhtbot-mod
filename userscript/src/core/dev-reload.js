// Dev-only auto-reload: polls the local dev server's /build-id endpoint
// and reloads the page when it changes, so editing src/ + npm run dev is
// "save file, wait a second, page refreshes" with no manual Tampermonkey
// interaction.
//
// Safe to include in every build (not just dev): if the dev server isn't
// running (production/normal use), the fetch just fails silently and this
// no-ops forever. It never throws past its own boundary and never blocks
// boot().

const DEV_SERVER_ORIGIN = 'http://127.0.0.1:8787';
const POLL_INTERVAL_MS = 1500;

function startDevReloadWatcher(log, onDevModeDetected) {
  let currentBuildId = null;
  let everConnected = false;

  async function poll() {
    let buildId;
    try {
      const res = await fetch(`${DEV_SERVER_ORIGIN}/build-id`, { cache: 'no-store' });
      if (!res.ok) return;
      buildId = (await res.text()).trim();
    } catch {
      // Dev server not running — expected in normal (non-dev) use. Stay quiet.
      return;
    }

    if (!everConnected) {
      everConnected = true;
      log(`dev-reload watcher connected (build ${buildId})`);
      // Running against the local dev server means this build was never
      // published to GitHub, so comparing it against dist/build-id.txt
      // there would be meaningless noise (see update-checker/index.js) —
      // tell whoever's listening to skip that check entirely.
      onDevModeDetected?.();
    }

    if (currentBuildId === null) {
      currentBuildId = buildId;
      return;
    }

    if (buildId !== currentBuildId) {
      log(`dev-reload: new build detected (${currentBuildId} -> ${buildId}), reloading...`);
      location.reload();
    }
  }

  const intervalId = setInterval(poll, POLL_INTERVAL_MS);
  poll();

  return () => clearInterval(intervalId);
}

export { startDevReloadWatcher };
