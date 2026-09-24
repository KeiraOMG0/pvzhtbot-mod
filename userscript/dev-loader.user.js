// ==UserScript==
// @name         PvZHTBot Mod (dev loader)
// @namespace    https://pvzhtbot.com
// @version      0.2.0
// @description  Dev-only loader that fetches the latest local build fresh on every page load (no @require caching), so the real script never needs re-pasting into Tampermonkey while iterating.
// @match        https://pvzhtbot.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==
//
// Unlike @require (which Tampermonkey caches and does NOT refetch on
// every page load — a common dev-loop gotcha), this fetches
// dist/pvzhtbot-mod.user.js fresh every time via GM_xmlhttpRequest with a
// cache-busting query param, then eval()s it in the page. Rebuild with
// `npm run build` (or `npm run dev` to build + serve in one step), then
// just refresh the pvzhtbot.com tab — the new code is guaranteed to load.
//
// IMPORTANT: this only works while `npm run serve` (or `npm run dev`) is
// running in a terminal. When you're done developing, either stop using
// this script or swap it for the real dist/pvzhtbot-mod.user.js pasted in
// directly (no dependency on a local server) for normal use.

(function () {
  const url = `http://127.0.0.1:8787/pvzhtbot-mod.user.js?_=${Date.now()}`;
  GM_xmlhttpRequest({
    method: 'GET',
    url,
    onload(res) {
      if (res.status !== 200) {
        console.error('[pvzhtbot-mod dev-loader] fetch failed with status', res.status);
        return;
      }
      try {
        // eslint-disable-next-line no-eval
        (0, eval)(res.responseText);
      } catch (err) {
        console.error('[pvzhtbot-mod dev-loader] eval failed:', err);
      }
    },
    onerror(err) {
      console.error('[pvzhtbot-mod dev-loader] dev server not reachable (is `npm run dev` running?):', err);
    },
  });
})();
