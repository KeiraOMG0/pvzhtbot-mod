# Decklists API — pvzhtbot.com

Status legend: **CONFIRMED** · **INFERRED** · **UNKNOWN**

## Load all community decklists
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/decklists/`
- Triggered by: visiting `/decklists`
- Response: bare JSON array, 133 entries observed. Shape per entry:
  ```json
  {
    "deckid": 1,
    "name": "Carroot",
    "hero": "Beta-Carrotina",
    "side": "Plants",
    "category": "Ladder",
    "archetype": "Combo Tempo",
    "description": "free text",
    "image": "https://cdn.pvzhtbot.com/decks/plants/beta-carrotina/1-carroot.webp",
    "creator": "Natz",
    "cost": "74950",
    "aliases": "bctempo, bcroots, caroot",
    "cards": "Forget-Me-Nuts|4\nGalacta-Cactus|2\nGarlic|4\n...(12 lines total)"
  }
  ```
  `cards` is a single string: one `CardName|Quantity` pair per line
  (`\n`-separated), 12 lines per deck (standard PvZH deck size:
  quantities sum to 40). Must be parsed client-side — not structured JSON.
  `cost` appears to be an in-game currency/sparks total as a numeric
  string, meaning unconfirmed.

## Decklist count
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/decklist-count/`
- Response: `{"count": 133}`

## Buildability filter ("Can Build" / "Close to Building")
**CONFIRMED (client-side only)** — the `/decklists` page has a
"Collection" filter dropdown with options "Can Build (N)" and "Close to
Building (X%) (N)". Selecting either does **not** trigger any network
request — confirmed via live network capture (only the initial page-load
requests fire; filtering is done entirely client-side against data already
loaded: `decklists/`, `cardinfo/`, and `user-cards/`). This means
buildability logic is native to the site's frontend, not a separate API
capability — any mod feature duplicating this should reuse the same
`user-cards/` + `decklists/` data, not invent a new comparison method.

## Personal decks list (distinct from public /decklists/)
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/user-decks/`
- Fires from `/dashboard/decks` ("My Decklists" page)
- Response: `{"success": true, "decks": []}` (empty on the test account —
  shape of a populated entry not yet confirmed, but likely close to a
  `decklists/` entry given the site's other paired endpoints follow this
  pattern, e.g. `user-cards/` vs `cardinfo/`)

## Deck creation form (observed, NOT submitted)
**CONFIRMED (UI only)** — the "+ Add Deck" modal on `/dashboard/decks` has
these fields: Deck Name, Upload Image (file input), Side (Plants/Zombies),
Hero (dropdown - populated from the 11 heroes per side, matching
`heroinfo/` counts), Category, Archetype, Description, Creator,
Optimization, Inspiration, Deck Tutorial URL, and a Cards multi-select
search box that's dynamically scoped to the selected hero's legal classes
(confirmed: selecting Citron narrowed the field to "Guardian / Smarty"
cards only, with the field label updating to reflect that). All of this
filtering happens **client-side** against the already-loaded `cardinfo/`
response - no additional API calls fire while filling out the form.

**INFERRED, NOT independently verified live**: static string search of
the site's bundled JS turned up the literal strings `user-decks/create/`
and `user-decks/shared/`, strongly suggesting `POST
.../tbotapp/user-decks/create/` is the real submit endpoint (mirroring
the already-confirmed `user-cards/create/` pattern) and a `.../shared/`
variant exists for shared/public decks. Neither was triggered - do not
build against these until independently confirmed via an actual (opt-in,
user-approved) deck creation.

## Notes
`/profile/<username>/decks/` (see `docs/profiles.md`) returns a *user's
own public-facing* decks in a trimmer shape - distinct from both
`user-decks/` (this account's private deck-management list) and
`decklists/` (the full public community database). Three related-but-
different endpoints; don't conflate them.
