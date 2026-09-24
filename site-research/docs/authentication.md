# Authentication / session behavior — pvzhtbot.com

Status legend: **CONFIRMED** (observed in a capture) · **INFERRED** (from frontend code/structure, not directly observed) · **UNKNOWN**

Source capture: `captures/capture-2026-09-18T06-31-25-039Z.jsonl`

## Login flow
- **UNKNOWN (by design)** — the user logged in manually outside of capture,
  before any recording started, specifically to avoid ever touching
  credentials. Frontend uses Discord OAuth (see `auth/discord/me/` path and
  `discord_id` field in profile data) — **INFERRED**: login is "Login with
  Discord" OAuth, but the actual OAuth redirect/callback sequence was not
  captured.

## Session mechanism
- **CONFIRMED**: No `Authorization` header, no custom `X-Api-Key`/bearer
  token is sent on any observed request. All API calls to
  `api.pvzhtbot.com` succeed with only standard browser headers
  (`user-agent`, `referer`, `accept`, `sec-ch-ua-*`).
- **INFERRED**: Session is carried via an HttpOnly cookie set at login time
  (not observed being set in this capture, since capture started
  post-login). Supporting evidence: response headers include
  `access-control-allow-credentials: true` together with a specific
  `access-control-allow-origin` (not `*`), which is the standard CORS
  configuration required for cookie-based cross-subdomain auth from
  `https://pvzhtbot.com` → `https://api.pvzhtbot.com`.
- **UNKNOWN**: exact cookie name(s), expiry, `SameSite` setting. Not
  observable via Playwright's header capture for this run — would need a
  dedicated capture right after a fresh login/redirect.

## Current-user identification
- **CONFIRMED**: `GET https://api.pvzhtbot.com/tbotapp/auth/discord/me/`
  returns:
  ```json
  {"authenticated": true, "user": {"id": 91, "username": "keiraomg0", "first_name": "Keira✿", "avatar": "<discord-cdn-url>", "is_owner": false}}
  ```
  This is the "who am I" endpoint used by the app on every page load
  (called on `/`, `/dashboard`, `/dashboard/card-manager`).
- **CONFIRMED**: `GET https://api.pvzhtbot.com/tbotapp/profile/me/` returns
  the logged-in user's own site profile (separate from the Discord
  identity record — see `docs/profiles.md`).
- No request body/params required for either call; identity is derived
  server-side from the session.

## CSRF / request protections
**CONFIRMED** (live-tested via a single net-zero card-quantity edit, see
`docs/cards.md`):
- `GET https://api.pvzhtbot.com/tbotapp/csrf/` issues a token:
  `{"csrfToken": "<opaque ~64-char string>"}`. This call requires no body
  and rides the existing session cookie.
- Every state-changing request must echo that token back as the
  `X-CSRFToken` request header, alongside `Content-Type: application/json`.
  Confirmed working: `PATCH /tbotapp/user-cards/<id>/` with this header
  succeeded (200); the token is presumably validated against the session
  server-side (classic Django CSRF pattern — `csrftoken`/`csrfToken`
  naming is a strong hint the backend is Django/DRF).
- **UNKNOWN**: token lifetime/expiry, whether it's single-use or
  reusable across multiple writes in one page session, and whether it's
  also deliverable via a cookie (double-submit) vs. purely response-body
  delivery as observed.
- The one observed `POST` to `https://pvzhtbot.com/cdn-cgi/rum?` is
  Cloudflare's Real User Monitoring beacon, unrelated to the app API —
  not evidence of CSRF handling.

## Platform / infra notes (CONFIRMED from response headers)
- Frontend (`pvzhtbot.com`) is served via **Vercel** (`x-vercel-id`,
  `x-vercel-cache` headers) behind **Cloudflare** (`cf-ray`,
  `cf-cache-status`).
- API (`api.pvzhtbot.com`) is a separate origin/service (Django-style path
  convention `/tbotapp/<resource>/`), also behind Cloudflare.
- Security headers present: `strict-transport-security`,
  `x-content-type-options`, `x-frame-options`, `referrer-policy`,
  `cross-origin-opener-policy`.

## Notes
No secrets (cookie values, tokens) exist anywhere in the capture file — the
logger's redaction strips `cookie`, `set-cookie`, `authorization`, and any
JSON field matching `/password|secret|token|api[_-]?key|session|auth|cookie|bearer/i`
before writing to disk. Note the redaction pattern is intentionally broad
and over-redacts the harmless `authenticated: true` boolean field in
several responses (visible as `"authenticated":"[REDACTED len=4]"`) — this
is a false positive (the value is just `true`), not a secret; call it out
in the api.md spec as boolean `true`/`false`.
