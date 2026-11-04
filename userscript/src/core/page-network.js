// Shared hooks into the PAGE's own network APIs, so plugins can block or
// answer requests the site itself makes (not just their own):
//
//   addRequestBlocker((url: URL, kind) => boolean) -> remove()
//       kind is 'fetch' | 'beacon' | 'xhr' | 'script'. Return true to drop
//       the request: fetch resolves to an empty 204, sendBeacon reports
//       success, XHR never sends, and a <script src> is never inserted
//       (dynamic appendChild/insertBefore) or is neutralized as the parser
//       adds it (MutationObserver).
//
//   addFetchHandler(({ url, method, passThrough }) => Promise<Response> | undefined) -> remove()
//       Return a promise to answer a page fetch yourself (e.g. from a
//       cache), or undefined to let it through. passThrough() performs
//       the original request un-intercepted.
//
//   pageFetch(input, init)
//       fetch() through the page's (hooked) fetch, so the mod's own API
//       calls share whatever the handlers do (one cache for site + mod).
//
// The hooks install once, lazily, on the first add*() call. To catch the
// site's very first requests they must be installed before the site's
// bundle runs: plugins do that from `earlyInit` (run at document-start,
// see plugin-manager.js runEarlyHooks). Installed later, they still
// apply to every request made from then on.
//
// Everything is fail-open: a throwing blocker/handler is logged and the
// request goes through untouched, so a plugin bug can't break the site.

const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

const blockers = new Set();
const fetchHandlers = new Set();
let installed = false;
let nativeFetch = null;

function toUrl(input) {
  try {
    const raw = typeof input === 'string' ? input : input?.href ?? input?.url ?? String(input);
    return new URL(raw, pageWindow.location.href);
  } catch {
    return null;
  }
}

function isBlocked(url, kind) {
  if (!url || blockers.size === 0) return false;
  for (const fn of blockers) {
    try {
      if (fn(url, kind)) return true;
    } catch (err) {
      console.error('[Greenhouse] request blocker threw', err);
    }
  }
  return false;
}

function isBlockedScript(node) {
  return node?.nodeName === 'SCRIPT' && Boolean(node.src) && isBlocked(toUrl(node.src), 'script');
}

function install() {
  if (installed) return;
  installed = true;

  // ---- fetch ----
  nativeFetch = pageWindow.fetch;
  pageWindow.fetch = function fetch(input, init) {
    const url = toUrl(input);
    const passThrough = () => nativeFetch.call(pageWindow, input, init);
    if (isBlocked(url, 'fetch')) {
      return Promise.resolve(new pageWindow.Response(null, { status: 204 }));
    }
    if (url && fetchHandlers.size) {
      const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
      for (const handler of fetchHandlers) {
        try {
          const answer = handler({ url, method, passThrough });
          if (answer) return answer;
        } catch (err) {
          console.error('[Greenhouse] fetch handler threw', err);
        }
      }
    }
    return passThrough();
  };

  // ---- navigator.sendBeacon (Cloudflare/Vercel analytics' usual transport) ----
  const navProto = pageWindow.Navigator?.prototype;
  if (navProto?.sendBeacon) {
    const nativeBeacon = navProto.sendBeacon;
    navProto.sendBeacon = function sendBeacon(url, data) {
      if (isBlocked(toUrl(url), 'beacon')) return true;
      return nativeBeacon.call(this, url, data);
    };
  }

  // ---- XMLHttpRequest (the site uses fetch; this is for third-party fallbacks) ----
  const xhrProto = pageWindow.XMLHttpRequest?.prototype;
  if (xhrProto) {
    const nativeOpen = xhrProto.open;
    const nativeSend = xhrProto.send;
    xhrProto.open = function open(method, url, ...rest) {
      this.__ghBlocked = isBlocked(toUrl(url), 'xhr');
      return nativeOpen.call(this, method, url, ...rest);
    };
    xhrProto.send = function send(body) {
      if (this.__ghBlocked) return undefined;
      return nativeSend.call(this, body);
    };
  }

  // ---- <script src> added from JS (e.g. Vercel's analytics injector) ----
  const nodeProto = pageWindow.Node?.prototype;
  if (nodeProto) {
    for (const name of ['appendChild', 'insertBefore']) {
      const native = nodeProto[name];
      nodeProto[name] = function (node, ...rest) {
        if (isBlockedScript(node)) return node;
        return native.call(this, node, ...rest);
      };
    }
  }

  // ---- <script src> in the HTML itself (e.g. Cloudflare's injected beacon) ----
  // The parser runs a microtask checkpoint before preparing each script,
  // so flipping its type here stops it executing.
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (isBlockedScript(node)) {
          node.type = 'javascript/blocked';
          node.remove();
        }
      }
    }
  }).observe(document.documentElement || document, { childList: true, subtree: true });
}

function addRequestBlocker(fn) {
  install();
  blockers.add(fn);
  return () => blockers.delete(fn);
}

function addFetchHandler(fn) {
  install();
  fetchHandlers.add(fn);
  return () => fetchHandlers.delete(fn);
}

function pageFetch(input, init) {
  return pageWindow.fetch(input, init);
}

export { addRequestBlocker, addFetchHandler, pageFetch, pageWindow };
