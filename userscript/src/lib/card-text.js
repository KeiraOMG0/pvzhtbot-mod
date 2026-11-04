// Helpers for the site's card text, which is stored Discord-bot style:
// class/stat icons are Discord emoji tags like <:Brainz:1062502890448638022>.

/**
 * Turns Discord-markup card text into plain words:
 *   `<:Bullseye:1>__Bullseye__` -> `Bullseye`   (icon + label: keep the label only)
 *   `+1<:Strength:2>`           -> `+1 Strength`
 * and strips __underline__ / **bold** markers.
 */
function cleanEmoji(text) {
  return String(text || '')
    .replace(/<a?:[A-Za-z0-9_-]+:\d+>\s*(?=__)/g, '')
    .replace(/(\d)<a?:([A-Za-z0-9_-]+):\d+>/g, '$1 $2')
    .replace(/<a?:([A-Za-z0-9_-]+):\d+>/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\r/g, '')
    .trim();
}

/**
 * Parses a cardinfo `stats` string ("1 <:Brainz:..> 1 <:Strength:..> 2 <:Health:..>")
 * into { cost, strength, strengthIcon, health, healthIcon }.
 *
 * Stats are POSITIONAL: cost, then (for fighters) strength, then health.
 * The icon in each slot varies - confirmed live 2026-11-03 - the strength
 * slot can show a trait (Bullseye, Frenzy, Strikethrough, AntiHero,
 * Deadly, DoubleStrike, Overshoot) and the health slot can too (Armored,
 * Untrickable, Special, healthstrength). Tricks/environments only have
 * the cost token. So read by position, not by icon name.
 */
function parseStats(stats) {
  const out = { cost: null, strength: null, strengthIcon: null, health: null, healthIcon: null };
  const tokens = [...String(stats || '').matchAll(/(\S+)\s*<a?:([A-Za-z]+):\d+>/g)].map((m) => ({
    value: m[1],
    icon: m[2],
  }));
  if (tokens[0]) out.cost = tokens[0].value;
  if (tokens.length >= 3) {
    out.strength = tokens[1].value;
    out.strengthIcon = tokens[1].icon;
    out.health = tokens[2].value;
    out.healthIcon = tokens[2].icon;
  }
  return out;
}

/** Normalizes a card name for matching across endpoints (case, curly quotes, spacing). */
function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function looseKey(name) {
  return normName(name).replace(/[^a-z0-9]/g, '');
}

function editDistance(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Builds a forgiving name -> card lookup for human-typed card names (guides,
 * deck notes). Tries exact, then punctuation/spacing-insensitive
 * ("Lima Pleurodon" -> "Lima-Pleurodon"), then a unique match within a small
 * edit distance ("Imitator" -> "Imitater", "Bog of Enlightment" ->
 * "Bog of Enlightenment"). Returns null rather than guessing between two
 * equally-close cards.
 */
function createCardMatcher(cards) {
  const exact = new Map();
  const loose = new Map();
  for (const c of cards) {
    exact.set(normName(c.card_name), c);
    loose.set(looseKey(c.card_name), c);
  }
  const looseKeys = [...loose.keys()];
  return function match(name) {
    const hit = exact.get(normName(name)) || loose.get(looseKey(name));
    if (hit) return hit;
    const key = looseKey(name);
    if (key.length < 6) return null;
    const cap = key.length >= 12 ? 2 : 1;
    let best = null;
    let bestD = cap + 1;
    let tie = false;
    for (const k of looseKeys) {
      const d = editDistance(key, k, cap);
      if (d < bestD) {
        best = k;
        bestD = d;
        tie = false;
      } else if (d === bestD && d <= cap) {
        tie = true;
      }
    }
    return best && bestD <= cap && !tie ? loose.get(best) : null;
  };
}

export { cleanEmoji, parseStats, normName, createCardMatcher };
