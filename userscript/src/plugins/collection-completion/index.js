// Collection Completion Tracker
//
// The site shows "Unique Cards" / "Total Copies" on the Card Manager page
// but never tells you what fraction of the GAME's normal cards you
// actually own, or breaks it down by side/class, or lists what's missing.
// This plugin adds that, read-only, using only confirmed API calls
// (getAllCardInfo, getMyCards, getClasses, getAvailableCards — see
// site-research/docs/api.md). It never writes anything.
//
// Mounts only on /dashboard/card-manager: a 3rd stat box in the existing
// `.card-manager-summary` section (matching its `.summary-item` /
// `.summary-label` styling) showing "X / Y (Z%)", and an expandable panel
// below it listing missing cards grouped by side + class. Hero/Superpower
// cards (which the site's own Add Cards UI excludes entirely — confirmed
// during API research) are excluded from "missing" so the number matches
// what's actually achievable via the site's own Add Cards flow.

// Live-updates: subscribes to onCollectionChanged (core/collection-watcher.js)
// so any write to user-cards/ - whether from this plugin, another
// plugin, or the site's own Card Manager Save/Delete buttons - triggers
// an immediate recompute, no page reload required.
import { onCollectionChanged } from '../../core/collection-watcher.js';

const SUMMARY_SELECTOR = '.card-manager-summary';
const CONTENT_SELECTOR = '.card-manager-content';
const MARKER_ATTR = 'data-pvzhtbot-collection-completion';
const STYLE_ID = 'pvzhtbot-collection-completion-styles';

const STYLES = `
.pvzhtbot-cc-details {
  background: #14161a;
  border: 1px solid #262626;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 0 0 16px;
  font-size: 13px;
  color: #ccc;
}
.pvzhtbot-cc-details summary {
  cursor: pointer;
  font-weight: 600;
  color: #eee;
  list-style: none;
}
.pvzhtbot-cc-details summary::-webkit-details-marker { display: none; }
.pvzhtbot-cc-details summary::before { content: '▶ '; }
.pvzhtbot-cc-details[open] summary::before { content: '▼ '; }
.pvzhtbot-cc-summary-sub { font-size: 11px; color: #999; margin-top: 4px; font-weight: 400; }
.pvzhtbot-cc-group { margin-top: 10px; }
.pvzhtbot-cc-group-title { font-weight: 600; color: #9be29b; margin-bottom: 4px; }
.pvzhtbot-cc-underplayset-qty { color: #e0c96a; }
.pvzhtbot-cc-card-list { display: flex; flex-wrap: wrap; gap: 6px; }
.pvzhtbot-cc-card-chip {
  background: #1f2125;
  border: 1px solid #333;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
}
.pvzhtbot-cc-loading, .pvzhtbot-cc-empty { color: #999; font-style: italic; }
.pvzhtbot-cc-error { color: #e08080; }
.pvzhtbot-cc-matrix { border-collapse: collapse; margin-top: 8px; width: 100%; table-layout: fixed; }
.pvzhtbot-cc-matrix th { font-size: 11px; color: #999; font-weight: 600; padding: 4px 6px; text-align: center; }
.pvzhtbot-cc-matrix th:first-child { text-align: left; width: 22%; }
.pvzhtbot-cc-matrix-row-label { font-size: 12px; color: #eee; font-weight: 600; text-align: left !important; padding: 4px 6px !important; }
.pvzhtbot-cc-matrix-cell {
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  padding: 6px 4px;
  border-radius: 4px;
  border: 2px solid #14161a;
}
.pvzhtbot-cc-matrix-cell-empty {
  text-align: center;
  font-size: 11px;
  color: #444;
  padding: 6px 4px;
}
.pvzhtbot-cc-matrix-event-row { margin-top: 10px; font-size: 12px; color: #ccc; }
`;

function injectStylesOnce() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function isCardManagerPage() {
  return location.pathname === '/dashboard/card-manager' || location.pathname === '/dashboard/card-manager/';
}

function buildSummaryBox(percentText) {
  const box = document.createElement('div');
  box.className = 'summary-item';
  box.setAttribute(MARKER_ATTR, 'summary');

  const label = document.createElement('span');
  label.className = 'summary-label';
  label.textContent = 'Completion';

  const value = document.createElement('div');
  // Match the sibling value elements' likely tag/style: they're plain
  // text nodes after the label span, at bold/large size in the site's
  // own CSS (no separate class was found on the number itself), so reuse
  // inline styling comparable to typical stat displays instead of
  // guessing at an undocumented class name.
  value.className = 'pvzhtbot-cc-summary-value';
  value.style.fontWeight = '700';
  value.style.fontSize = '20px';
  value.style.marginTop = '2px';
  value.textContent = percentText;

  const subLine = document.createElement('div');
  subLine.className = 'pvzhtbot-cc-summary-sub';

  box.appendChild(label);
  box.appendChild(value);
  box.appendChild(subLine);
  return box;
}

// Percentage never rounds up to 100% unless truly complete - 502/503
// rounding to "100%" was misleading (a real bug caught in testing).
function pctFloorUnlessComplete(owned, total) {
  if (total === 0) return 0;
  if (owned >= total) return 100;
  return Math.min(99, Math.floor((owned / total) * 100));
}

function formatCompletionValue(result) {
  const pct = pctFloorUnlessComplete(result.ownedNormal, result.totalNormal);
  return `${result.ownedNormal} / ${result.totalNormal} (${pct}%)`;
}

function formatPlaysetSubLine(result) {
  const pct = pctFloorUnlessComplete(result.fullPlaysetNormal, result.totalNormal);
  return `4x playsets: ${result.fullPlaysetNormal} / ${result.totalNormal} (${pct}%)`;
}

// Bump the version suffix whenever the computation logic changes (not
// just when the account's cards change) - the fingerprint alone can't
// catch "same data, different (fixed) code", since sessionStorage
// persists across a rebuild/reload during dev. Caught live: the rarity
// normalization fix below didn't visibly apply until this was bumped,
// because the stale v1 cache still matched the unchanged fingerprint.
const CACHE_KEY = 'pvzhtbot-mod-collection-completion-cache-v2';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — hard upper bound even if the fingerprint somehow still matches

// The cached breakdown is only reused if this fingerprint still matches
// the account's current collection. Computed from a getMyCards() response
// that's fetched either way, so checking it costs nothing extra — it just
// means a *stale* cache (e.g. right after adding/removing a card) is
// detected and thrown away instead of silently showing old numbers.
function fingerprintCards(myCardsRes) {
  const uniqueCount = myCardsRes.cards.length;
  const totalQuantity = myCardsRes.cards.reduce((sum, c) => sum + c.quantity, 0);
  return `${uniqueCount}:${totalQuantity}`;
}

function readCache(fingerprint) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    if (parsed.fingerprint !== fingerprint) return null;
    return parsed.result;
  } catch {
    return null;
  }
}

function writeCache(result, fingerprint) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), fingerprint, result }));
  } catch {
    // best-effort; ignore quota/availability errors
  }
}

// The site's own card data has at least one inconsistent set_rarity
// string: "Colossal-Super-Rare" with no spaces (on "Cursed Gargolith",
// cardid 40 - confirmed live via cardinfo/), vs. "Colossal - Super-Rare"
// with spaces around the SET/TIER separator on every other card of that
// rarity. Without normalizing, that one card silently fragments into its
// own 1-card "rarity" row instead of joining the other 14 - exactly the
// kind of wrong-looking count a completion tracker should never show.
//
// Fix: every known rarity string is "<Set> - <Tier>" where <Tier> is
// itself sometimes hyphenated (e.g. "Super-Rare"). Only the FIRST hyphen
// is the set/tier separator, so only that one gets space-normalized -
// naively normalizing every hyphen would also mangle "Super-Rare" into
// "Super - Rare", which is wrong.
function normalizeRarity(rawRarity) {
  if (!rawRarity) return 'Unknown';
  const trimmed = rawRarity.trim();
  const firstHyphen = trimmed.indexOf('-');
  if (firstHyphen === -1) return trimmed;
  const set = trimmed.slice(0, firstHyphen).trim();
  const tier = trimmed.slice(firstHyphen + 1).trim();
  return `${set} - ${tier}`;
}

function splitSetAndTier(normalizedRarity) {
  const firstHyphen = normalizedRarity.indexOf(' - ');
  if (firstHyphen === -1) return { set: normalizedRarity, tier: '' };
  return {
    set: normalizedRarity.slice(0, firstHyphen),
    tier: normalizedRarity.slice(firstHyphen + 3),
  };
}

// Sets in the order the user actually plays/collects them, not
// alphabetical or by card count. Basic is the entry-level set, then
// standard PvZH rarity chase order, with "Event" (promo/limited-time
// cards, no consistent tier) last since it doesn't fit the normal
// set/tier progression.
const SET_ORDER = ['Basic', 'Premium', 'Galactic', 'Colossal', 'Triassic', 'Event'];
const TIER_ORDER = ['Common', 'Uncommon', 'Rare', 'Super-Rare', 'Legendary'];

function orderIndex(list, value) {
  const idx = list.indexOf(value);
  return idx === -1 ? list.length : idx; // unknown values sort after known ones
}

function compareRaritiesBySetThenTier(a, b) {
  const aParts = splitSetAndTier(a.rarity);
  const bParts = splitSetAndTier(b.rarity);
  const setDiff = orderIndex(SET_ORDER, aParts.set) - orderIndex(SET_ORDER, bParts.set);
  if (setDiff !== 0) return setDiff;
  const tierDiff = orderIndex(TIER_ORDER, aParts.tier) - orderIndex(TIER_ORDER, bParts.tier);
  if (tierDiff !== 0) return tierDiff;
  return a.rarity.localeCompare(b.rarity);
}

async function computeCompletion(api, { forceRefresh = false } = {}) {
  // getMyCards() is cheap (one request) and needed either way, so fetch
  // it first to check the cache fingerprint before deciding whether the
  // expensive ~10-request side/class sweep is actually necessary.
  const myCardsRes = await api.getMyCards();
  const fingerprint = fingerprintCards(myCardsRes);

  if (!forceRefresh) {
    const cached = readCache(fingerprint);
    if (cached) return cached;
  }

  const FULL_PLAYSET = 4;
  const allCards = await api.getAllCardInfo();
  // Keyed by card_name alone: verified empirically (full ~594-card sweep)
  // that every card_name is globally unique across both sides - no
  // collisions today, but not guaranteed by the API schema. If a future
  // card ever reused a name across Plants/Zombie, this would need to
  // become a composite key.
  const owned = new Set(myCardsRes.cards.map((c) => c.card_name));
  const ownedQty = new Map(myCardsRes.cards.map((c) => [c.card_name, c.quantity]));

  const sides = ['Plants', 'Zombie'];
  const missingBySideClass = [];
  const underPlaysetBySideClass = [];
  const byRarity = new Map(); // rarity -> { total, owned, fullPlayset }
  let totalNormal = 0;
  let ownedNormal = 0;
  let fullPlaysetNormal = 0;

  // This sweep assumes every normal card belongs to exactly one class, so
  // it's counted exactly once across all side/class combinations.
  // Verified empirically: of 594 total cards, every multi-class card_type
  // (comma-separated, e.g. "Guardian, Smarty") belongs to a Hero-rarity
  // card, and available/ never returns heroes anyway (confirmed earlier).
  // No normal card had a multi-class card_type as of this check, so no
  // double-counting occurs today - but this isn't schema-guaranteed,
  // just confirmed against the current dataset.
  for (const side of sides) {
    const { classes } = await api.getClasses(side);
    for (const cardClass of classes) {
      const available = await api.getAvailableCards(side, cardClass);
      const list = Array.isArray(available) ? available : available.cards || [];
      for (const card of list) {
        totalNormal += 1;

        const rarity = normalizeRarity(card.set_rarity);
        if (!byRarity.has(rarity)) byRarity.set(rarity, { total: 0, owned: 0, fullPlayset: 0 });
        const rarityStats = byRarity.get(rarity);
        rarityStats.total += 1;

        if (card.already_owned) {
          ownedNormal += 1;
          rarityStats.owned += 1;

          const qty = ownedQty.get(card.card_name) || 0;
          if (qty >= FULL_PLAYSET) {
            fullPlaysetNormal += 1;
            rarityStats.fullPlayset += 1;
          } else {
            let group = underPlaysetBySideClass.find((g) => g.side === side && g.cardClass === cardClass);
            if (!group) {
              group = { side, cardClass, cards: [] };
              underPlaysetBySideClass.push(group);
            }
            group.cards.push({ name: card.card_name, quantity: qty });
          }
        } else {
          let group = missingBySideClass.find((g) => g.side === side && g.cardClass === cardClass);
          if (!group) {
            group = { side, cardClass, cards: [] };
            missingBySideClass.push(group);
          }
          group.cards.push(card.card_name);
        }
      }
    }
  }

  const rarityBreakdown = [...byRarity.entries()]
    .map(([rarity, stats]) => ({ rarity, ...stats }))
    .sort(compareRaritiesBySetThenTier);

  const result = {
    totalNormal,
    ownedNormal,
    fullPlaysetNormal,
    missingBySideClass,
    underPlaysetBySideClass,
    rarityBreakdown,
    totalGameCards: allCards.length,
    ownedTotal: owned.size,
  };
  writeCache(result, fingerprint);
  return result;
}

// Grid: sets (rows, in SET_ORDER minus "Event") x tiers (columns, in
// TIER_ORDER). "Event" has no tier structure (every Event card is just
// "Event", no Common/Rare/etc.), so it's rendered as its own single row
// below the grid rather than forced into a column that would be empty
// for every other set.
const GRID_SETS = SET_ORDER.filter((s) => s !== 'Event');

function cellColor(owned, total) {
  if (total === 0) return '#444'; // no cards of this set/tier combo exist
  if (owned === total) return '#3f9e5e';
  if (owned === 0) return '#5a2a2a';
  return '#8a6a2a';
}

function buildRarityMatrix(rarityBreakdown) {
  const bySetTier = new Map(); // "Set|Tier" -> {owned, total}
  let eventStats = null;
  for (const { rarity, owned, total } of rarityBreakdown) {
    const { set, tier } = splitSetAndTier(rarity);
    if (set === 'Event') {
      eventStats = { owned, total };
    } else {
      bySetTier.set(`${set}|${tier}`, { owned, total });
    }
  }

  const wrapper = document.createElement('div');

  const table = document.createElement('table');
  table.className = 'pvzhtbot-cc-matrix';

  const headerRow = document.createElement('tr');
  headerRow.appendChild(document.createElement('th')); // empty corner cell
  for (const tier of TIER_ORDER) {
    const th = document.createElement('th');
    th.textContent = tier;
    headerRow.appendChild(th);
  }
  table.appendChild(headerRow);

  for (const set of GRID_SETS) {
    const row = document.createElement('tr');
    const setHeader = document.createElement('th');
    setHeader.className = 'pvzhtbot-cc-matrix-row-label';
    setHeader.textContent = set;
    row.appendChild(setHeader);

    let setHasAnyData = false;
    for (const tier of TIER_ORDER) {
      const stats = bySetTier.get(`${set}|${tier}`);
      const cell = document.createElement('td');
      if (stats) {
        setHasAnyData = true;
        cell.className = 'pvzhtbot-cc-matrix-cell';
        cell.style.background = cellColor(stats.owned, stats.total);
        cell.textContent = `${stats.owned}/${stats.total}`;
        cell.title = `${set} - ${tier}: ${stats.owned}/${stats.total} owned`;
      } else {
        cell.className = 'pvzhtbot-cc-matrix-cell-empty';
        cell.textContent = '—';
      }
      row.appendChild(cell);
    }

    if (setHasAnyData) table.appendChild(row);
  }
  wrapper.appendChild(table);

  if (eventStats) {
    const eventRow = document.createElement('div');
    eventRow.className = 'pvzhtbot-cc-matrix-event-row';
    const label = document.createElement('span');
    label.textContent = 'Event: ';
    const value = document.createElement('span');
    value.style.color = cellColor(eventStats.owned, eventStats.total);
    value.style.fontWeight = '700';
    value.textContent = `${eventStats.owned}/${eventStats.total}`;
    eventRow.appendChild(label);
    eventRow.appendChild(value);
    wrapper.appendChild(eventRow);
  }

  return wrapper;
}

function buildDetailsPanel(result) {
  const details = document.createElement('details');
  details.className = 'pvzhtbot-cc-details';
  details.setAttribute(MARKER_ATTR, 'details');

  const summary = document.createElement('summary');
  const missingCount = result.totalNormal - result.ownedNormal;
  summary.textContent =
    missingCount === 0
      ? 'Completion breakdown (100% — full collection of normal cards!)'
      : `Completion breakdown (${missingCount} missing across ${result.missingBySideClass.length} side/class groups)`;
  details.appendChild(summary);

  if (result.rarityBreakdown?.length) {
    const rarityTitle = document.createElement('div');
    rarityTitle.className = 'pvzhtbot-cc-group-title';
    rarityTitle.style.marginTop = '4px';
    rarityTitle.textContent = 'By set / rarity';
    details.appendChild(rarityTitle);
    details.appendChild(buildRarityMatrix(result.rarityBreakdown));
  }

  if (missingCount > 0) {
    const missingTitle = document.createElement('div');
    missingTitle.className = 'pvzhtbot-cc-group-title';
    missingTitle.style.marginTop = '14px';
    missingTitle.textContent = `Missing cards (${missingCount})`;
    details.appendChild(missingTitle);

    for (const group of result.missingBySideClass) {
      const groupEl = document.createElement('div');
      groupEl.className = 'pvzhtbot-cc-group';

      const title = document.createElement('div');
      title.className = 'pvzhtbot-cc-group-title';
      title.textContent = `${group.side} — ${group.cardClass} (${group.cards.length})`;
      groupEl.appendChild(title);

      const list = document.createElement('div');
      list.className = 'pvzhtbot-cc-card-list';
      for (const name of group.cards) {
        const chip = document.createElement('span');
        chip.className = 'pvzhtbot-cc-card-chip';
        chip.textContent = name;
        list.appendChild(chip);
      }
      groupEl.appendChild(list);
      details.appendChild(groupEl);
    }
  }

  const underPlaysetCount = result.underPlaysetBySideClass?.reduce((sum, g) => sum + g.cards.length, 0) || 0;
  if (underPlaysetCount > 0) {
    const underTitle = document.createElement('div');
    underTitle.className = 'pvzhtbot-cc-group-title';
    underTitle.style.marginTop = '14px';
    underTitle.textContent = `Owned but under 4x playset (${underPlaysetCount})`;
    details.appendChild(underTitle);

    for (const group of result.underPlaysetBySideClass) {
      const groupEl = document.createElement('div');
      groupEl.className = 'pvzhtbot-cc-group';

      const title = document.createElement('div');
      title.className = 'pvzhtbot-cc-group-title';
      title.textContent = `${group.side} — ${group.cardClass} (${group.cards.length})`;
      groupEl.appendChild(title);

      const list = document.createElement('div');
      list.className = 'pvzhtbot-cc-card-list';
      for (const { name, quantity } of group.cards) {
        const chip = document.createElement('span');
        chip.className = 'pvzhtbot-cc-card-chip';
        chip.textContent = name;
        const qtySpan = document.createElement('span');
        qtySpan.className = 'pvzhtbot-cc-underplayset-qty';
        qtySpan.textContent = ` ${quantity}/4`;
        chip.appendChild(qtySpan);
        list.appendChild(chip);
      }
      groupEl.appendChild(list);
      details.appendChild(groupEl);
    }
  }

  const note = document.createElement('div');
  note.style.marginTop = '10px';
  note.style.fontSize = '11px';
  note.style.color = '#777';
  note.textContent =
    'Hero and Superpower cards are excluded — the site\'s own Add Cards flow doesn\'t offer them either.';
  details.appendChild(note);

  return details;
}

const collectionCompletionPlugin = {
  id: 'collection-completion',
  name: 'Collection Completion Tracker',
  description: 'Shows % of normal cards owned and lists what\'s missing, on the Card Manager page. Updates live when you add/remove/edit cards, no refresh needed.',
  defaultEnabled: true,

  async init(context) {
    injectStylesOnce();

    let disposed = false;
    let injectedSummary = null;
    let injectedDetails = null;

    async function recompute({ forceRefresh = false } = {}) {
      if (disposed || !injectedSummary) return;
      const valueEl = injectedSummary.querySelector('.pvzhtbot-cc-summary-value');
      const subEl = injectedSummary.querySelector('.pvzhtbot-cc-summary-sub');
      valueEl.textContent = '…';
      valueEl.className = 'pvzhtbot-cc-summary-value';
      subEl.textContent = '';

      try {
        const result = await computeCompletion(context.api, { forceRefresh });
        if (disposed) return;
        valueEl.textContent = formatCompletionValue(result);
        subEl.textContent = formatPlaysetSubLine(result);

        const newDetailsPanel = buildDetailsPanel(result);
        if (injectedDetails) {
          injectedDetails.replaceWith(newDetailsPanel);
        } else {
          injectedSummary.parentElement.insertAdjacentElement('afterend', newDetailsPanel);
        }
        injectedDetails = newDetailsPanel;
      } catch (err) {
        valueEl.textContent = 'error';
        valueEl.className = 'pvzhtbot-cc-error';
        context.log(`[collection-completion] failed to compute: ${err.message}`, 'error');
      }
    }

    function tryInject() {
      if (disposed || !isCardManagerPage()) return;
      const summarySection = document.querySelector(SUMMARY_SELECTOR);
      const content = document.querySelector(CONTENT_SELECTOR);
      if (!summarySection || !content) return;
      if (summarySection.querySelector(`[${MARKER_ATTR}="summary"]`)) return;

      injectedSummary = buildSummaryBox('…');
      summarySection.appendChild(injectedSummary);
      injectedDetails = null;
      recompute();
    }

    tryInject();
    const observer = new MutationObserver(() => tryInject());
    observer.observe(document.body, { childList: true, subtree: true });

    // Any add/remove/quantity-edit anywhere (this plugin, another
    // plugin, or the site's own Card Manager UI) triggers a live
    // recompute here — no page reload needed. forceRefresh bypasses the
    // sessionStorage cache outright since we already know it's stale.
    const unsubscribe = onCollectionChanged(() => recompute({ forceRefresh: true }));

    return () => {
      disposed = true;
      observer.disconnect();
      unsubscribe();
      injectedSummary?.remove();
      injectedDetails?.remove();
    };
  },
};

export { collectionCompletionPlugin };
