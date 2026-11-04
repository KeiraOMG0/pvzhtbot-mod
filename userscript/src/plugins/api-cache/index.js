// API Cache — makes pages load faster by caching the site's big shared
// data files instead of re-downloading them on every page.
//
// Why: every API response is `Cache-Control: max-age=0, must-revalidate`
// with no validator, so the browser re-downloads all of it on every
// navigation - cardinfo alone is ~390 KB (decklists ~140 KB, legacy
// decklists ~170 KB, public decks ~135 KB), ~250-400 ms each, measured
// 2026-11-03.
//
// What's cached: ONLY public reference data that is byte-identical
// whether or not you're logged in (verified for every path below). Your
// own data - collection (user-cards), decks, profile, auth, CSRF - is
// never cached, and nothing but GETs is touched.
//
// How: a fetch handler (core/page-network.js) answers the site's AND the
// mod's own requests for those paths:
//   - cached and younger than the TTL  -> served instantly, no request
//   - cached but older                 -> "instant" mode: served instantly
//                                         and refreshed in the background
//                                         (the page after that is fresh);
//                                         otherwise waits for the network
//   - not cached                       -> network, then stored
//   - network fails / 5xx              -> falls back to the cached copy
// Concurrent requests for the same URL share one download.
//
// Stored in the browser's Cache Storage for pvzhtbot.com (survives
// reloads). Turning the plugin off clears it; `__greenhouse.clearApiCache()`
// does too, and `__greenhouse.apiCacheStats()` shows hits/misses.

import { definePlugin } from '../../core/define-plugin.js';
import { addFetchHandler, pageWindow } from '../../core/page-network.js';
import { SITE_API_BASE } from '../../api/site-api.js';

const CACHE_NAME = 'greenhouse-api-v1';
const API = new URL(SITE_API_BASE);
const CACHEABLE_PATHS = new Set(
  [
    'cardinfo/',
    'heroinfo/',
    'decklists/',
    'legacy-decklists/',
    'public-decks/',
    'keeporscrap/',
    'site-updates/',
    'servers/',
    'card-count/',
    'decklist-count/',
    'legacy-decklist-count/',
    'public-user-decks-count/',
  ].map((p) => `${API.pathname.replace(/\/$/, '')}/${p}`)
);

const memory = new Map(); // url -> entry { text, status, contentType, at }
const inflight = new Map(); // url -> Promise<entry>
const stats = { hit: 0, stale: 0, miss: 0, fallback: 0 };
let removeHandler = null;

function isCacheable(url, method) {
  return method === 'GET' && url.origin === API.origin && CACHEABLE_PATHS.has(url.pathname);
}

async function openCache() {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null; // Cache Storage unavailable - memory-only for this page
  }
}

async function readEntry(key) {
  if (memory.has(key)) return memory.get(key);
  const cache = await openCache();
  const res = await cache?.match(key);
  if (!res) return null;
  const entry = {
    text: await res.text(),
    status: res.status,
    contentType: res.headers.get('content-type') || 'application/json',
    at: Number(res.headers.get('x-greenhouse-cached-at')) || 0,
  };
  memory.set(key, entry);
  return entry;
}

async function writeEntry(key, entry) {
  memory.set(key, entry);
  const cache = await openCache();
  await cache?.put(
    key,
    new Response(entry.text, {
      status: entry.status,
      headers: { 'content-type': entry.contentType, 'x-greenhouse-cached-at': String(entry.at) },
    })
  );
}

// Downloads and (if 2xx) stores. Shared per URL so the site and the mod
// asking at the same moment cost one request.
function download(key, passThrough) {
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const res = await passThrough();
    const entry = {
      text: await res.text(),
      status: res.status,
      contentType: res.headers.get('content-type') || 'application/json',
      at: Date.now(),
    };
    if (res.ok) await writeEntry(key, entry).catch(() => {});
    return entry;
  })();
  inflight.set(key, p);
  p.finally(() => inflight.delete(key)).catch(() => {});
  return p;
}

function toPageResponse(entry) {
  // Built in the page's realm so the site's code gets a native Response.
  return new pageWindow.Response(entry.text, {
    status: entry.status,
    headers: { 'content-type': entry.contentType },
  });
}

async function serve(key, passThrough, ctx) {
  const ttlMs = ctx.options.get('ttlMinutes') * 60_000;
  const cached = await readEntry(key).catch(() => null);
  const age = cached ? Date.now() - cached.at : Infinity;

  if (cached && age < ttlMs) {
    stats.hit++;
    return toPageResponse(cached);
  }
  if (cached && ctx.options.get('instant')) {
    stats.stale++;
    download(key, passThrough).catch((err) => ctx.log(`background refresh failed: ${err.message}`, 'error'));
    return toPageResponse(cached);
  }

  stats.miss++;
  try {
    const fresh = await download(key, passThrough);
    if (fresh.status >= 500 && cached) {
      stats.fallback++;
      return toPageResponse(cached);
    }
    return toPageResponse(fresh);
  } catch (err) {
    if (cached) {
      stats.fallback++;
      return toPageResponse(cached);
    }
    throw err;
  }
}

async function clearCache() {
  memory.clear();
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    // ignore
  }
}

function install(ctx) {
  if (removeHandler) return;
  removeHandler = addFetchHandler(({ url, method, passThrough }) => {
    if (!isCacheable(url, method)) return undefined;
    if (ctx.options.get('ttlMinutes') <= 0) return undefined; // 0 = caching off
    return serve(url.href, passThrough, ctx);
  });
  pageWindow.__greenhouse = {
    ...(pageWindow.__greenhouse || {}),
    clearApiCache: clearCache,
    apiCacheStats: () => ({ ...stats, entriesInMemory: memory.size }),
  };
}

const apiCachePlugin = definePlugin({
  id: 'api-cache',
  name: 'Faster Loading (API Cache)',
  description:
    'Caches the site’s large shared data (cards, heroes, decklists, Keep or Scrap, updates) so pages load instantly instead of re-downloading ~1 MB every visit. Your own collection and decks are never cached.',
  tags: ['performance'],
  defaultEnabled: false, // opt-in: trades up to ttlMinutes of staleness for speed
  options: {
    ttlMinutes: {
      type: 'number',
      label: 'Treat cached data as fresh for (minutes)',
      description: 'Within this window, no request is made at all. 0 turns caching off.',
      default: 10,
      min: 0,
      max: 1440,
    },
    instant: {
      type: 'boolean',
      label: 'Show cached data instantly, refresh in the background',
      description:
        'After the window above, still show the cached copy right away and update it for next time. Off = wait for fresh data.',
      default: true,
    },
  },

  earlyInit(ctx) {
    install(ctx);
  },

  async init(ctx) {
    install(ctx);
    return () => {
      removeHandler?.();
      removeHandler = null;
      clearCache();
    };
  },
});

export default apiCachePlugin;
export { apiCachePlugin };
