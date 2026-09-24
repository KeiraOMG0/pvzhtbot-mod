// Watches for any write to the site's own user-cards/ endpoints (add,
// quantity update, delete — whether triggered by the site's own Card
// Manager UI or by a mod plugin) and notifies subscribers so they can
// refresh without requiring a manual page reload.
//
// Implemented by monkey-patching window.fetch once per page load. This
// only inspects request URLs/methods that were already confirmed in
// site-research/docs/api.md (PATCH/POST/DELETE .../user-cards/...) — it
// never modifies requests or blocks them, only observes after they
// resolve successfully.

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const listeners = new Set();
let patched = false;

function isUserCardsWrite(url, method) {
  if (!WRITE_METHODS.has(method)) return false;
  try {
    const u = new URL(url, location.href);
    return u.hostname === 'api.pvzhtbot.com' && u.pathname.includes('/user-cards/');
  } catch {
    return false;
  }
}

function ensurePatched() {
  if (patched) return;
  patched = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    const method = (init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    const response = await originalFetch(input, init);

    if (response.ok && isUserCardsWrite(url, method)) {
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          // a listener's own error shouldn't break fetch for the rest of the page
        }
      }
    }

    return response;
  };
}

/**
 * Registers a callback to run shortly after any successful write to
 * user-cards/ is observed. Returns an unsubscribe function.
 */
function onCollectionChanged(callback) {
  ensurePatched();
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export { onCollectionChanged };
