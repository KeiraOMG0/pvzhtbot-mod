# API specification — pvzhtbot.com (draft, phase 1)

Status legend: **CONFIRMED** (observed in a live capture) · **INFERRED** (from frontend/reference script, not directly observed) · **UNKNOWN**

Base URL: `https://api.pvzhtbot.com/tbotapp`
Frontend origin: `https://pvzhtbot.com` (Vercel + Cloudflare)
Auth: cookie-based session (no `Authorization` header seen anywhere); CORS
configured with `access-control-allow-credentials: true` for the
`pvzhtbot.com` → `api.pvzhtbot.com` cross-subdomain pattern.

Sources: `captures/capture-2026-09-18T06-31-25-039Z.jsonl` (passive page-load
capture) + a live, driven, net-zero card-quantity edit via
`mcp__claude-in-chrome` browser tools (not file-logged, verified inline).

## Endpoint index

| Method | Path | Auth | Status | Notes |
|---|---|---|---|---|
| GET | `/auth/discord/me/` | yes | CONFIRMED | current Discord identity |
| GET | `/profile/me/` | yes | CONFIRMED | current user's site profile |
| GET | `/profile/<username>/` | likely public | CONFIRMED | any profile by slug, includes `is_owner`/`is_site_owner` relative to viewer |
| GET | `/profile/<username>/decks/` | likely public | CONFIRMED | that profile's decks |
| GET | `/profile/<username>/cards/` | likely public | CONFIRMED | that profile's card collection (trimmed card shape) |
| GET | `/user-cards/` | yes | CONFIRMED | current session user's full card collection, no pagination |
| GET | `/user-cards/classes/?side=<side>` | yes | CONFIRMED | `{"classes": ["Guardian", ...]}` — array of plain strings |
| GET | `/user-cards/available/?side=<side>&class=<class>` | yes | CONFIRMED | normal cards in that side/class, each with `already_owned: bool` |
| PATCH | `/user-cards/<id>/` | yes | CONFIRMED | update quantity of an owned card; body `{"quantity": N}` |
| DELETE | `/user-cards/<id>/` | yes | INFERRED | presumed remove-card action behind the "Delete" button; not executed |
| POST | `/user-cards/create/` | yes | CONFIRMED | add card(s); body `{"cards":[{"card_name","quantity"}]}`; live-tested single-card, 201, `{"success","created","cards"}` |
| GET | `/cardinfo/` | sent w/ session, may be public | CONFIRMED | full static card database, JSON array |
| GET | `/card-count/` | sent w/ session, may be public | CONFIRMED | `{"count": N}` — total distinct cards in the game |
| GET | `/csrf/` | yes | CONFIRMED | `{"csrfToken": "..."}`, required for writes |
| GET | `/decklists/` | sent w/ session, likely public | CONFIRMED | full public community deck list, bare JSON array, 133 entries observed |
| GET | `/decklist-count/` | sent w/ session, likely public | CONFIRMED | `{"count": N}` |
| GET | `/heroinfo/` | sent w/ session, likely public | CONFIRMED | `{"count": N, "results": [...]}` — paginated-style wrapper (differs from `cardinfo/`'s bare array), 22 hero cards observed |
| GET | `/profiles/` | sent w/ session, likely public | CONFIRMED | `{"success": true, "profiles": [...]}` — every public profile (35 observed), same shape as `profile/<username>/`'s `profile` object |
| GET | `/profiles/count/` | sent w/ session, likely public | CONFIRMED | `{"count": N}` — count of public profiles |
| GET | `/user-decks/` | yes | INFERRED | observed firing from the personal decks page; not yet inspected for response shape |
| PATCH/PUT | `/profile/me/` (or similar) | yes | UNKNOWN | profile-edit write (Display Name/Profile URL/Bio/Public toggle) — UI confirmed, exact endpoint/method NOT confirmed; deliberately not triggered (see docs/profiles.md) |

## Authentication summary
See `docs/authentication.md` for full detail. Short version: log in via
Discord OAuth (inferred, not captured), session cookie carries auth on
every subsequent request, no bearer/API-key header anywhere, CSRF token
fetched separately and sent as `X-CSRFToken` on writes.

## Card/profile summary
See `docs/cards.md` and `docs/profiles.md`. Short version: collections and
profiles are read in full (no pagination on ~500-900 record responses);
writes are per-card (`PATCH .../user-cards/<id>/` with `{"quantity": N}`),
not bulk, in the one flow actually exercised. Hero/Superpower cards are
excluded entirely from the addable-card surface (`available/`) — confirmed
live by sweeping every side/class combination and finding zero
not-already-owned normal cards on this test account, while `cardinfo/`
still lists dozens of hero/power entries that never appear as addable.

## Error responses
**CONFIRMED (one case)**: `GET /profile/<nonexistent-slug>/` returns
`404` with body `{"detail": "No UserProfile matches the given query."}`
— a standard Django REST Framework not-found shape (strongly supports the
backend being DRF, consistent with the `csrftoken`/`csrfToken` naming
seen earlier). Naturally encountered while trying an incorrect profile
slug guess (the real slug had a trailing period the display name didn't
show) — not a deliberate error-probing test, just what happened when a
wrong-but-plausible slug was tried once.

**Still UNKNOWN**: error shape for bad card id, invalid quantity,
expired/missing CSRF token, or an unauthenticated write. Do not guess —
only document these if naturally encountered.

## Rate limiting
**UNKNOWN** — no rate-limit response observed. Do not probe this
deliberately; only document it if naturally encountered.

## Known unknowns going into the wrapper
1. Exact login/OAuth redirect sequence.
2. Cookie name(s)/attributes (HttpOnly/SameSite/expiry).
3. CSRF token lifetime/reuse semantics.
4. `DELETE /user-cards/<id>/` — unconfirmed.
5. `POST /user-cards/create/` with **multiple** cards in one call, and its
   behavior on an already-owned card (409 conflict shape claimed by a
   reference script, not independently confirmed) — only a single new
   card in a single call has been tested. See docs/cards.md.
6. Whether `/profile/<username>/`, `/cardinfo/`, `/card-count/` truly work
   without any session (public reads) — only tested while authenticated.
7. Error response shape for any endpoint.
