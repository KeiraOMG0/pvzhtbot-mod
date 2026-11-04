# Privacy / tracking audit — pvzhtbot.com

Audited 2026-11-03 from a logged-in browser session: network requests on
page load, the full frontend bundle (`/assets/index-BZJlGuKo.js`, ~1 MB),
the `me`/`profile/me` API responses, cookies/storage visible to page JS, the
Discord OAuth request, and `/privacypolicy`. Passive observation only — no
probing of admin or undocumented endpoints.

Status legend: **CONFIRMED** (observed) · **INFERRED** · **UNKNOWN**

## Third-party trackers loaded on every page

| Script | Who | What it collects | Status |
|---|---|---|---|
| `/_vercel/insights/script.js` | Vercel Web Analytics (bundled `@vercel/analytics`) | Page path, referrer, country, browser/OS/device; cookieless — unique visitors via a daily-rotating hash of IP + UA on Vercel's side | **CONFIRMED** loaded by the bundle (503 in the audited browser, so blocked/unavailable there) |
| `static.cloudflareinsights.com/beacon.min.js` | Cloudflare Web Analytics (RUM), injected by Cloudflare, not in the bundle | Page URL, referrer, page-load timings, UA, country; posts to `/cdn-cgi/rum` | **CONFIRMED** (503 in audited browser; a `/cdn-cgi/rum` POST was seen in the 2026-09-18 capture) |

No Google Analytics, gtag, Hotjar, Clarity, PostHog, Sentry, Mixpanel,
LogRocket, Umami or Plausible. No `sendBeacon`, no canvas/WebGL
fingerprinting, no timezone/screen probing. **CONFIRMED** (bundle grep).

Neither analytics tool is mentioned in the privacy policy.

## What the frontend itself collects

- **Browser + OS** (`mr()` / `pr()` from `navigator.userAgent`/`platform`):
  sent **only** with bug reports (`POST /tbotapp/bug-reports/create/`),
  shown to you as read-only fields first. The same request also sends your
  `discord_id`, `discord_username`, `page_url` and an optional screenshot.
  **CONFIRMED**
- No `localStorage`/`sessionStorage`/`indexedDB`/`document.cookie` use by
  the site's own bundle. **CONFIRMED**
- Only one `MutationObserver`, and it's Vite's modulepreload polyfill
  (watches for `<link rel=modulepreload>`), not DOM/mod surveillance.
  **CONFIRMED**
- No client-side check for userscripts or extensions (nothing references
  Tampermonkey, `GM_`, `greenhouse`, `pvzhtbot-mod`, `webdriver`).
  The only matches for "userscript"/"extension" are the ToS text.
  **CONFIRMED** for this bundle; it can change on any deploy.
- The frontend has no admin page for user activity. The admin routes it
  ships are `/admin`, `/admin/bugs`, `/admin/keeporscrap`, `/admin/updates`,
  `/admin/decklists(/add)`, `/admin/suggestions` and `/admin/user-decks`.
  **CONFIRMED** (route table in the bundle).

## What the server has about you

- **Discord OAuth scope is `identify` only**: Discord ID, username, global
  name, avatar. No email, no server list, no messages. **CONFIRMED**
  (authorize URL: `scope=identify`, `response_type=code`).
- Session is an HttpOnly cookie on `api.pvzhtbot.com`. Page JS sees no
  cookies. **CONFIRMED**
- `auth/discord/me/` → `id, username, first_name, avatar, is_owner`.
- `profile/me/` → `id, discord_id, username, display_name, profile_slug,
  avatar, bio, is_public, youtube/twitch/tiktok/instagram/twitter/
  discord_server URLs, created_at, updated_at`. **CONFIRMED**
- Your card collection (`user-cards`), decks, saved decks, suggestions and
  bug reports, all keyed to your account. **CONFIRMED** (endpoints exist and
  are tied to the session).
- **Request logs** (IP, UA, path, time, session) at Cloudflare, Vercel and
  the Django API. Not visible from the client, but standard for this stack.
  **INFERRED**. Every API call made with your session cookie, including
  ones made by a userscript, is attributable to your account.

## What could reveal a client mod (informational)

The current bundle checks for none of these. All of them are visible to any
page script if the site ever looks:
- Server side: API calls in patterns the stock UI doesn't make, all with
  your session cookie.
- DOM / page globals: `data-greenhouse-*` attributes, `#greenhouse-*`
  elements, `window.__greenhouse` (set via `unsafeWindow`).
- `localStorage['pvzhtbot_mod_settings_v1']` was present in the audited
  browser. It's left over from storage.js's non-Tampermonkey fallback or
  the old script; the Tampermonkey build uses `GM_setValue`.

## What Greenhouse does about it

- **Analytics Blocker** (required, always on) blocks both analytics scripts and
  their collection endpoints.
- Mod API calls already go out with the browser's own headers: same
  User-Agent, `sec-ch-ua`, cookies and Origin as the site's own calls.
  They are made from the page with `credentials: 'include'`.
- Spoofing the User-Agent from a userscript would not help. It can't
  change the UA *header* on page loads or API calls. It would only change
  what page JS reads, which the site uses only for bug reports you
  choose to send, and a JS/header mismatch is itself more distinctive.
  Being logged in identifies the account regardless.

## Gaps between the privacy policy and observed behavior

- Vercel Web Analytics and Cloudflare Web Analytics are not disclosed.
- Card collection, profile social links/bio, suggestions, and bug-report
  browser/OS/screenshot data aren't listed under "Information We Store".
- No retention period and no self-serve deletion. Section 05/07 say to
  contact the administrator.
