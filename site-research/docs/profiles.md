# Profile API — pvzhtbot.com

Status legend: **CONFIRMED** · **INFERRED** · **UNKNOWN**

Source capture: `captures/capture-2026-09-18T06-31-25-039Z.jsonl`

## Load own profile ("me")
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/profile/me/`
- Auth required: yes (session cookie, implicit)
- Triggered by: loading `/`, `/dashboard`, and `/profile/<username>` (even
  when viewing your own profile, `profile/me/` is fetched alongside the
  public `profile/<username>/` call — likely used for the `is_owner` UI logic)
- Query params: none
- Request body: none (GET)
- Response 200 JSON shape:
  ```json
  {
    "authenticated": true,
    "profile_exists": true,
    "profile": {
      "id": 94,
      "discord_id": "320737951460098049",
      "username": "keiraomg0",
      "display_name": "Keira✿",
      "profile_slug": "keiraomg0",
      "avatar": "a729031a6b73be2087df96c160221a0f",
      "bio": "string",
      "is_public": true,
      "created_at": "2026-09-17T23:30:12.753519Z",
      "updated_at": "2026-09-18T06:30:21.004253Z"
    }
  }
  ```
  Note: `avatar` here is just the Discord avatar hash, not a full URL
  (contrast with `auth/discord/me/`, which returns a full CDN URL).

## Load public profile by username/slug
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/profile/<username>/`
  (observed: `.../profile/keiraomg0/`)
- Auth required: appears not strictly required for public profiles
  (`is_public: true` in the profile data suggests a privacy toggle exists),
  but this was only tested while authenticated — **UNKNOWN** whether it
  works unauthenticated or for `is_public: false` profiles.
- Triggered by: visiting `/profile/<username>`
- Response 200 JSON shape:
  ```json
  {
    "profile": { "...same shape as above..." },
    "deck_count": 0,
    "card_count": 503,
    "is_owner": true,
    "is_site_owner": false
  }
  ```
  `is_owner` and `is_site_owner` are computed relative to the requesting
  session — i.e. this single endpoint doubles as "view any profile" and
  reports whether the viewer owns it / is a site owner.

## Load profile's decks
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/profile/<username>/decks/`
- Response 200 JSON shape (own empty-deck account):
  ```json
  {
    "success": true,
    "profile": { "...same profile object..." },
    "decks": [],
    "is_owner": true
  }
  ```
- **CONFIRMED populated example** (public deckbuilder `xeraaaaaa.`, 3 decks):
  each entry in `decks` has this shape:
  ```json
  {
    "id": 50,
    "profile_id": 29,
    "username": "xeraaaaaa.",
    "display_name": "xera",
    "profile_slug": "xeraaaaaa.",
    "avatar": "af5faa6a25ad35c48ac4a86df736ee0c",
    "name": "\"Optimal\" No-Hokai",
    "hero": "Impfinity",
    "side": "Zombies",
    "category": "Competitive",
    "archetype": "Midrange",
    "description": "free text",
    "image": "https://cdn.pvzhtbot.com/user_decks/<side>/<hero-slug>/<slug>-<id>.png",
    "cost": "57800",
    "aliases": null,
    "cards": "Bungee Plumber|4\r\nUnlife of the Party|3\r\n...(15 lines for this deck; not always 12 - see caveat)"
  }
  ```
  **Important inconsistencies vs. `decklists/` (public community decks,
  see `docs/decklists.md`)**, both confirmed live:
  1. `side` is **`"Zombies"`** (plural) here, vs. `"Zombie"` (singular) in
     `decklists/`, `cardinfo/`, and `user-cards/`. A plugin that compares
     `side === "Zombie"` will silently fail to match decks from this
     endpoint.
  2. The `cards` field's line separator is **`\r\n`** here (confirmed via
     `.includes('\r')` check), vs. bare `\n` in `decklists/`. `split('\n')`
     still works on either (the trailing `\r` gets removed by a
     `.trim()` on each line) but don't assume the separator is identical
     across these two endpoints if writing stricter parsing.
  3. Card-list length is **not always 12** here (the sample deck had 15
     lines) - `decklists/`'s 12-line/40-total pattern was observed but
     may not be a hard rule; don't assume a fixed count.

## Load profile's card collection (by username)
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/profile/<username>/cards/`
- Distinct from `user-cards/` (see docs/cards.md) — this is scoped to a
  specific profile slug rather than "the current session's user."
- Response 200 JSON shape:
  ```json
  {
    "profile": "keiraomg0",
    "cards": [
      {
        "id": 8095,
        "card_name": "2nd-Best Taco of All Time",
        "quantity": 4,
        "card": { "...card metadata, see docs/cards.md..." }
      }
    ]
  }
  ```
  Note: the `card` sub-object here omits `aliases`, `button*` fields that
  are present in the `user-cards/` and `cardinfo/` variants — this
  endpoint returns a trimmed card shape.

## Update profile
- **UNKNOWN** — not yet triggered. Likely candidates based on visible
  fields (`bio`, `is_public`, `display_name`, `avatar`): a PATCH/PUT to
  `profile/me/` or a dedicated `profile/update/` endpoint, but this is
  **INFERRED speculation only** — do not build against it until confirmed
  by an actual capture of a profile edit action.

## Notes
All profile reads observed so far are `GET`, unauthenticated-looking CORS
config, cookie-session based. No pagination applies to single-profile
endpoints (not applicable). No update/write action has been observed yet.
