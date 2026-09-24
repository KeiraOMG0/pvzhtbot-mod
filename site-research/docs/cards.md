# Card collection API — pvzhtbot.com

Status legend: **CONFIRMED** · **INFERRED** · **UNKNOWN**

Source capture: `captures/capture-2026-09-18T06-31-25-039Z.jsonl`

## Card database (all cards, not user-owned)
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/cardinfo/`
- Auth required: sent with session cookie present, but likely public
  reference data — **UNKNOWN** if it works unauthenticated.
- Triggered by: viewing a profile page (used client-side to enrich/cross
  reference card display, presumably).
- Query params: none observed.
- Response: **JSON array** (not wrapped in an object) of all card
  definitions in the game:
  ```json
  [
    {
      "cardid": 3,
      "card_type": "Sneaky",
      "card_name": "Ducky Tube Zombie",
      "side": "Zombie",
      "title": "Ducky Tube Zombie | <:Sneaky:...>",
      "stats": "1 <:Brainz:...> 1 <:Strength:...> 2 <:Health:...>",
      "description": "Party Pet Zombie",
      "ability": "string, may contain \\r\\n and Discord emoji markup",
      "thumbnail": "https://cdn.pvzhtbot.com/cards/<side>/<type>/<slug>.webp",
      "traits": "string, comma-separated, may be empty",
      "set_rarity": "e.g. 'Galactic - Super-Rare'",
      "flavor_text": "string",
      "aliases": "comma-separated search aliases",
      "button": "NULL or string",
      "button_emoji": "NULL or string",
      "button2": "NULL or string",
      "button_emoji2": "NULL or string"
    }
  ]
  ```
  `button`/`button_emoji`/`button2`/`button_emoji2` are literal string
  `"NULL"` in many records (not JSON null) — likely raw DB values leaking
  through un-normalized. **CONFIRMED** as observed, worth defensive
  handling in a wrapper (`"NULL"` !== actual null).

  **CONFIRMED data-quality issue**: `set_rarity` has at least one
  inconsistently-formatted value. Every other "Colossal Super-Rare" card
  uses `"Colossal - Super-Rare"` (spaces around the set/tier separator),
  but `cardid: 40` ("Cursed Gargolith", Zombie/Sneaky) has
  `"Colossal-Super-Rare"` (no spaces) — same rarity, different string.
  Confirmed live by diffing unique `set_rarity` values across all 594
  cards. Any code that groups/counts by `set_rarity` verbatim will
  silently split this one card into its own category. A userscript
  wrapper should normalize by splitting on the first `-` and
  re-joining as `"<set> - <tier>"` (the tier itself may legitimately
  contain a hyphen, e.g. "Super-Rare", so a naive "add spaces around
  every hyphen" normalization is wrong — only the first hyphen is the
  set/tier separator).

## Load current session user's card collection ("my cards")
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/user-cards/`
- Auth required: yes (scoped to session's own profile, no username param)
- Triggered by: `/dashboard/card-manager`
- Query params: **none observed** — full collection returned in one
  response (no `page`/`limit`/`offset` params were sent).
- Response 200 JSON shape:
  ```json
  {
    "authenticated": true,
    "profile_id": 94,
    "cards": [
      {
        "id": 8095,
        "card_name": "2nd-Best Taco of All Time",
        "quantity": 4,
        "card": { "...full cardinfo-shaped object, includes aliases/buttons..." }
      }
    ]
  }
  ```
  Observed collection size: ~500+ card-entries returned in a single
  response (body was captured truncated at the 8000-char logging cap, but
  no pagination request followed — the page did not issue a second page
  request, implying the full set came back in one call).

## Card counts / collection counts
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/card-count/`
- Response: `{"count": 594}` — total number of distinct card definitions
  in the game (matches roughly the `cardinfo/` array length), **not** the
  user's owned-card count.
- Separately, **CONFIRMED**: `profile/<username>/` response includes
  `"card_count": 503` — this is the *user's owned* distinct-card count
  (or total quantity — **UNKNOWN** which; needs cross-checking against
  actual `user-cards/` array length once untruncated).

## Pagination
- **CONFIRMED (negative finding)**: no pagination parameters (`page`,
  `limit`, `offset`, cursor, etc.) were sent by the frontend for
  `user-cards/`, `profile/<username>/cards/`, or `cardinfo/` despite each
  returning hundreds of records. The site appears to load full lists
  client-side and paginate/filter in the browser (if at all).
- **UNKNOWN**: whether the API *supports* pagination params that the
  frontend simply doesn't use (out of scope to test without a real UI
  control that would send them — no such control has been exercised yet).

## Class/side enumeration (used by the "Add Cards" picker)
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/user-cards/classes/?side=<Plants|Zombie>`
  Returns the list of card classes for that side (e.g. Guardian, Kabloom,
  Mega-Grow, Smarty, Solar for Plants; Beastly, Brainy, Crazy, Hearty,
  Sneaky for Zombie).
- `GET https://api.pvzhtbot.com/tbotapp/user-cards/available/?side=<side>&class=<class>`
  Returns every normal (non-hero, non-Superpower) card in that side/class,
  **each annotated with an `already_owned: boolean` field** — this is the
  field the UI uses to render "Already Owned" vs. selectable. Example
  shape:
  ```json
  {
    "cardid": 59, "card_name": "Arm Wrestler", "side": "Zombie",
    "card_type": "Hearty", "title": "...", "thumbnail": "...",
    "traits": "", "set_rarity": "Premium - Uncommon", "stats": "...",
    "description": "Sports Zombie", "already_owned": true
  }
  ```
  **CONFIRMED important caveat (per user, matches observed behavior):**
  Hero cards and Superpower cards are *not* returned by this endpoint at
  all — they are not addable/removable through the normal collection UI.
  Verified live: querying `cardinfo/` minus `user-cards/` produced 91
  "missing" entries, but every one of them was a hero/Superpower (e.g.
  "Citron", "Grass Knuckles", "Missile Madness"); sweeping *every*
  side/class combination through `available/` found **zero** cards with
  `already_owned: false` — i.e. this account's normal collectible-card set
  is 100% complete, and the gap is entirely non-collectible cards the API
  deliberately excludes from this endpoint.

## CSRF token issuance
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/csrf/`
- Response: `{"csrfToken": "<opaque string>"}` (observed length: 64 chars,
  alphanumeric). Not tied to a specific card/profile — appears to be a
  general per-session CSRF token issuer.
- Required by every state-changing request observed so far, sent back as
  request header `X-CSRFToken: <token>`.

## Update a card's quantity (the actual "add/remove" mechanism)
**CONFIRMED** — live-tested as a net-zero decrement + increment (4 → 3 → 4)
on card id 8095 ("2nd-Best Taco of All Time"), collection restored to its
original state immediately after.
- `PATCH https://api.pvzhtbot.com/tbotapp/user-cards/<user_card_id>/`
  (`<user_card_id>` is the `id` field from a `user-cards/` list entry, NOT
  the game's `cardid`)
- Request headers: `Content-Type: application/json`, `X-CSRFToken: <token
  from /csrf/>`, `Accept: application/json`. Cookie-based session auth as
  with all other endpoints (`credentials: include`).
- Request body: `{"quantity": <int>}`
- Response 200 JSON: `{"success": true, "id": 8095, "card_name": "...", "quantity": 4}`
- **CONFIRMED** (single-card live test, 2026-09-18): `POST
  https://api.pvzhtbot.com/tbotapp/user-cards/create/`
  - Request headers: `Content-Type: application/json`, `X-CSRFToken:
    <token from /csrf/>`, `Accept: application/json`. Same cookie-session
    auth as all other endpoints.
  - Request body: `{"cards": [{"card_name": "...", "quantity": N}, ...]}`
  - Response **201** JSON:
    ```json
    {
      "success": true,
      "created": 1,
      "cards": [
        {"id": 8378, "card_name": "Forget-Me-Nuts", "quantity": 4, "card": { /* full cardinfo-shaped object */ }}
      ]
    }
    ```
  - Test performed: user manually removed "Forget-Me-Nuts" (4 copies) via
    the site's own Card Manager UI, dropping the account from 503→502
    unique cards (confirmed via `GET user-cards/`). A single `create/`
    call with exactly one card (`{"cards":[{"card_name":"Forget-Me-Nuts","quantity":4}]}`)
    was sent, returned 201, and a follow-up `GET user-cards/` confirmed
    503/503 restored with `quantity: 4`. One request, no loop, no batch.
  - **STILL UNKNOWN**: behavior with multiple cards in one call, behavior
    on an already-owned card (does it 409, or does it just update
    quantity?), and the `already_owned`-conflict response shape claimed
    by the reference script — none of that was exercised, since this test
    intentionally stayed to a single new-card, single-request scope. Do
    not assume the multi-card/conflict behavior from `scripts/script_v2.js`
    is accurate until it's independently confirmed the same way.
- **UNKNOWN**: whether quantity can be set to 0 via PATCH as a "remove," or
  whether removal instead requires the `Delete` button's endpoint (see
  below). Not tested — going to 0 or delete risks losing the last copy of
  a real owned card, which weâ€™re only doing net-zero exercises on.

## Delete a card from profile
- **INFERRED, NOT CONFIRMED** — the card manager's per-card "Delete"
  button almost certainly calls `DELETE
  https://api.pvzhtbot.com/tbotapp/user-cards/<user_card_id>/` (same
  resource as the PATCH above, standard REST convention), but this was
  deliberately **not** clicked/tested because there's no disposable test
  card to safely delete-and-restore on this account (recreating a deleted
  card via `quantity` PATCH would need the record to still exist — DELETE
  presumably removes the whole `user-cards` row, not just decrements it).
  Confirm this only with explicit throwaway-data or when the user
  identifies a specific card they're fine having actually removed and
  re-added via a real "Add Cards" flow (which requires the card to appear
  in `available/` as addable in the first place — currently no such card
  exists on this account, see caveat above).

## Notes
Any add/remove card capture must correspond to exactly one real UI action.
Do not script repeated add/remove cycles. The quantity-PATCH flow above is
now fully confirmed end-to-end (CSRF fetch → PATCH → verified persisted
via a follow-up GET). The bulk `create/` endpoint and the `DELETE` verb
remain unconfirmed and should not be assumed correct without a live,
single-action capture.
