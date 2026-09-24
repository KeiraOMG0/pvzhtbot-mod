# Hero info API — pvzhtbot.com

Status legend: **CONFIRMED** · **INFERRED** · **UNKNOWN**

## Load all hero cards
**CONFIRMED**
- `GET https://api.pvzhtbot.com/tbotapp/heroinfo/`
- Response: `{"count": 22, "results": [...]}` (paginated-style wrapper,
  differs from `cardinfo/`'s bare array)
- Each result has the same shape as a normal `cardinfo/` entry
  (`cardid`, `card_type`, `card_name`, `side`, `title`, `thumbnail`,
  `set_rarity: "Premium - Hero"`, etc.) plus an `ability` field that
  concatenates **every superpower** the hero has into one string.

## No per-hero detail endpoint
**CONFIRMED (negative finding)**: `/heroinfo` on the site is a static
grid, not clickable tiles — there's no per-hero detail route/page, and no
additional API call fires beyond the one bulk `GET heroinfo/` on page
load (confirmed via network capture). Everything about a hero, including
all its superpower text, is already present in the single bulk response.
A plugin wanting hero/superpower data should fetch `heroinfo/` once and
build a local lookup — no extra requests needed per hero.

## Ability-string format (superpower parsing)
**CONFIRMED** via live example (Citron, cardid 866):

Each hero's `ability` field is multiple "blocks" separated by `\r\n\r\n`.
Each block's first line is the superpower's name followed by one or more
Discord-emoji class tags (`<:ClassName:emojiId>`); the remaining line(s)
are the effect text.

Example raw value (line breaks shown as `\r\n`):
```
Transmogrify <:Smarty:1062502890448638022> \r\nTransform a Zombie into a random Zombie that costs 1<:Brainz:...>.

Nut Signal <:Guardian:...> \r\nMake a Wall-Nut. Draw a card.

Wall-Nut\r\n0<:Strength:...>/6<:Health:...>, __Team-Up__

Root Wall <:Guardian:...> \r\nA Plant gets +2<:Health:...> and can't be hurt this turn.

Peel Shield <:Guardian:...><:Smarty:...> \r\nPlants can't be hurt this turn. \r\nDraw a card.
```

Parsing recipe:
```js
const blocks = hero.ability.split('\r\n\r\n');
for (const block of blocks) {
  const [firstLine, ...rest] = block.split('\r\n');
  const classTagPattern = /<:\w+:\d+>/g;
  const hasClassTag = classTagPattern.test(firstLine);
  const title = firstLine.replace(classTagPattern, '').trim();
  const effectText = rest.join('\n');
  // hasClassTag === false means this is likely a conjured-token
  // reminder block (e.g. "Wall-Nut" stats), not a real superpower -
  // see caveat below.
}
```

**Caveat (important)**: not every block is a real superpower. Some
heroes' `ability` strings include reminder/flavor blocks for tokens the
superpowers conjure (e.g. Citron's "Wall-Nut" block, which is just that
token's stat line, not a class-tagged superpower). These blocks lack a
`<:ClassName:id>` tag on their first line. A parser should treat
class-tag-less blocks as token/reminder text, not list them as a fourth
superpower — only tested against one hero (Citron) so this heuristic
should be spot-checked against a few more heroes before fully trusting
it in a shipped plugin.

## Notes
Superpower icons on the site are images (`cdn.pvzhtbot.com/heroes/<side>/<hero-slug>.webp`
for the hero portrait itself; individual superpower icons were not
separately captured), not derivable from text — a plugin wanting icons
would need to reference the site's own CDN URLs directly, which is fine
for `<img>` tags but means it depends on that CDN staying stable.
