// Analytics Blocker — stops the two third-party visitor-analytics scripts
// pvzhtbot.com loads on every page (see site-research/docs/privacy.md):
//
//   - Cloudflare Web Analytics: <script src="static.cloudflareinsights.com/
//     beacon.min.js"> injected into the HTML by Cloudflare, reporting to
//     /cdn-cgi/rum.
//   - Vercel Web Analytics: /_vercel/insights/script.js, appended by the
//     site's bundle (@vercel/analytics), reporting to /_vercel/insights/*.
//
// Neither is mentioned in the site's privacy policy. Blocking them breaks
// nothing: the site's features never read their output.
//
// Blocking is layered (see core/page-network.js): the script tags are
// never inserted/executed, and as a backstop any beacon/fetch/XHR to
// their collection endpoints is dropped. Installed in earlyInit, at
// document-start, so it beats the site's bundle; enabling it mid-session
// still blocks everything sent from then on.
//
// This only affects the analytics scripts. The site's own API (and
// therefore its server logs) are untouched; those always see your
// requests while you're logged in.

import { definePlugin } from '../../core/define-plugin.js';
import { addRequestBlocker } from '../../core/page-network.js';

const RULES = [
  {
    // Cloudflare Web Analytics
    match: (u) =>
      u.hostname === 'static.cloudflareinsights.com' ||
      u.hostname === 'cloudflareinsights.com' ||
      (u.hostname.endsWith('pvzhtbot.com') && u.pathname.startsWith('/cdn-cgi/rum')),
  },
  {
    // Vercel Web Analytics / Speed Insights
    match: (u) =>
      u.hostname === 'va.vercel-scripts.com' ||
      (u.hostname.endsWith('pvzhtbot.com') &&
        (u.pathname.startsWith('/_vercel/insights') || u.pathname.startsWith('/_vercel/speed-insights'))),
  },
];

let removeBlocker = null;
let blockedCount = 0;

function install(ctx) {
  if (removeBlocker) return;
  removeBlocker = addRequestBlocker((url, kind) => {
    if (!RULES.some((r) => r.match(url))) return false;
    blockedCount++;
    if (ctx.options.get('logBlocked')) ctx.log(`blocked ${kind} ${url.origin}${url.pathname}`);
    return true;
  });
}

const analyticsBlockerPlugin = definePlugin({
  id: 'analytics-blocker',
  name: 'Analytics Blocker',
  description:
    "Blocks the site's Cloudflare and Vercel visitor-analytics scripts (page views, referrer, device/browser, country, load timings). Site features are unaffected.",
  tags: ['privacy'],
  defaultEnabled: true,
  required: true, // core privacy plugin: always on, no toggle, nothing to opt out of
  priority: 90, // after crash-handler, before everything else
  options: {
    logBlocked: {
      type: 'boolean',
      label: 'Log each blocked request to the console',
      default: false,
    },
  },

  earlyInit(ctx) {
    install(ctx);
  },

  async init(ctx) {
    install(ctx); // no-op if earlyInit already ran
    ctx.log(`active (${blockedCount} request(s) blocked so far this page)`);
    return () => {
      removeBlocker?.();
      removeBlocker = null;
    };
  },
});

export default analyticsBlockerPlugin;
export { analyticsBlockerPlugin };
