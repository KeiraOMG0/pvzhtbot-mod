// Keep or Scrap Advisor - cross-references the site's Keep or Scrap
// guide with YOUR collection. The site's /keeporscrap page shows each
// class's tier list as an image plus written reasoning; it can't tell you
// which of the recommended cards you're actually missing. This does:
// "Craft picks you don't have a playset of", per class, at a glance.
//
// Data: GET keeporscrap/ + GET cardinfo/ + GET user-cards/. Read-only.
//
// IMPORTANT caveat (confirmed 2026-11-03): only the guide's written
// reasoning is machine-readable, and it names the *highlighted* cards
// per tier (~10-15 per class), not every card - the full tier list is
// only in the image. So this shows "the guide's picks", never "every
// card in tier X", and never claims an unmentioned card is Scrap.
//
// Parsing: `reasoning` is lines like "Craft: **Gravitree** and
// **Forget-Me-Nuts** are...". Known section headings: Craft / Use /
// Hold (also written "Keep") / Usable / Niche. A line starting with some
// other "Word:" (e.g. "Fireweed:") is a note inside the current section.

import { definePlugin } from '../../core/define-plugin.js';
import { createModal } from '../../ui/modal.js';
import { addDashboardTile } from '../../ui/dashboard-card.js';
import { cleanEmoji, normName, createCardMatcher } from '../../lib/card-text.js';
import { onCollectionChanged } from '../../core/collection-watcher.js';
import { THEME } from '../../core/brand.js';

const TIERS = [
  { key: 'craft', label: 'Craft', group: 'Craft', hint: 'So good they should be crafted.' },
  { key: 'use', label: 'Use', group: 'Keep', hint: 'Keep - most useful alongside lower-rarity cards.' },
  { key: 'hold', label: 'Hold for later', group: 'Keep', hint: 'Keep - best with other high-rarity cards.' },
  { key: 'usable', label: 'Usable', group: 'Scrappable', hint: 'Fine on a budget, loses value as your collection grows.' },
  { key: 'niche', label: 'Niche', group: 'Scrappable', hint: 'Great in specific strategies, weak elsewhere.' },
];
const HEADING_TO_TIER = { craft: 'craft', use: 'use', hold: 'hold', keep: 'hold', usable: 'usable', niche: 'niche' };

const STYLE_ID = 'greenhouse-kos-styles';
const STYLES = `
.gh-kos-summary { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.gh-kos-stat { background: ${THEME.bgRaised}; border: 1px solid ${THEME.border}; border-radius: 6px; padding: 6px 10px; }
.gh-kos-stat b { font-size: 15px; display: block; }
.gh-kos-controls { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.gh-kos-controls label { font-size: 12px; color: #ccc; display: flex; gap: 5px; align-items: center; cursor: pointer; }
.gh-kos-class { border: 1px solid ${THEME.border}; border-radius: 8px; padding: 8px 10px; margin-top: 10px; }
.gh-kos-class-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.gh-kos-class-head h4 { margin: 0; font-size: 14px; }
.gh-kos-tier { display: flex; gap: 8px; margin-top: 7px; align-items: flex-start; }
.gh-kos-tier-label { width: 96px; flex-shrink: 0; font-size: 11px; padding-top: 3px; }
.gh-kos-tier-label.craft { color: ${THEME.accent}; font-weight: 600; }
.gh-kos-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.gh-kos-chip { font-size: 12px; border-radius: 5px; padding: 2px 7px; border: 1px solid ${THEME.border}; background: ${THEME.bg}; cursor: help; }
.gh-kos-chip.have { border-color: ${THEME.accentBorder}; color: ${THEME.accent}; }
.gh-kos-chip.some { border-color: ${THEME.warnBorder}; color: ${THEME.warn}; }
.gh-kos-chip.none { border-color: ${THEME.dangerBorder}; color: ${THEME.danger}; }
.gh-kos-chip.unknown { color: #888; border-style: dashed; }
.gh-kos-foot { font-size: 11px; margin-top: 12px; }
`;

/** Parses one keeporscrap entry into [{ tier, name, note }]. Exported for reuse/tests. */
function parseGuide(reasoning) {
  const picks = [];
  const seen = new Set();
  let tier = null;
  for (const rawLine of String(reasoning || '').replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^([A-Za-z ]{2,20}):/);
    if (heading) {
      const mapped = HEADING_TO_TIER[heading[1].trim().toLowerCase()];
      if (mapped) tier = mapped;
    }
    if (!tier) continue;
    for (const m of line.matchAll(/\*\*([^*]+)\*\*/g)) {
      const name = m[1].trim();
      const key = normName(name);
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push({ tier, name, key, note: cleanEmoji(line) });
    }
  }
  return picks;
}

async function loadData(api) {
  const [guide, cardinfo, mine] = await Promise.all([
    api.getKeepOrScrap(),
    api.getAllCardInfo(),
    api.getMyCards().catch(() => null),
  ]);
  // The guide is hand-written, so names have typos ("Imitator",
  // "Lima Pleurodon") - match forgivingly instead of exact-only.
  const matchCard = createCardMatcher(cardinfo);
  const owned = mine ? new Map((mine.cards || []).map((c) => [normName(c.card_name), c.quantity])) : null;

  const classes = guide
    .filter((e) => e.card_class && e.card_class !== 'NULL' && !/intro/i.test(e.side))
    .map((e) => {
      const picks = parseGuide(e.reasoning).map((p) => {
        const card = matchCard(p.name);
        return {
          ...p,
          known: Boolean(card),
          displayName: card?.card_name || p.name,
          qty: owned && card ? owned.get(normName(card.card_name)) || 0 : null,
        };
      });
      return { side: e.side, cls: e.card_class, creator: cleanEmoji(e.creator), picks };
    });
  return { classes, loggedIn: Boolean(owned) };
}

export default definePlugin({
  id: 'keep-or-scrap-advisor',
  name: 'Keep or Scrap Advisor',
  description: "Cross-checks the site's Keep or Scrap guide against your collection: which recommended cards (especially Craft picks) you're still missing.",
  authors: ['Keira'],
  tags: ['cards', 'collection', 'guides'],
  defaultEnabled: true,
  options: {
    onlyMissing: {
      type: 'boolean',
      label: 'Start with "only cards I\'m missing" on',
      default: false,
    },
  },

  async init(ctx) {
    const { api, options, log } = ctx;
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    let data = null;
    let loading = null;
    let sideFilter = 'All';
    let onlyMissing = options.get('onlyMissing');

    const modal = createModal({ id: 'keep-or-scrap', title: 'Keep or Scrap Advisor', width: 720 });

    function chipClass(p) {
      if (!p.known) return 'unknown';
      if (p.qty === null) return '';
      return p.qty >= 4 ? 'have' : p.qty > 0 ? 'some' : 'none';
    }

    function render() {
      const body = modal.body;
      body.textContent = '';
      if (!data) {
        body.appendChild(Object.assign(document.createElement('div'), { className: 'gh-muted', textContent: 'Loading guide and your collection…' }));
        return;
      }

      const all = data.classes.flatMap((c) => c.picks.filter((p) => p.known));
      const craft = all.filter((p) => p.tier === 'craft');
      const craftMissing = craft.filter((p) => p.qty !== null && p.qty < 4);
      const keepMissing = all.filter((p) => (p.tier === 'use' || p.tier === 'hold') && p.qty !== null && p.qty < 4);

      const summary = document.createElement('div');
      summary.className = 'gh-kos-summary';
      const stat = (value, label) => {
        const s = document.createElement('div');
        s.className = 'gh-kos-stat';
        const b = document.createElement('b');
        b.textContent = value;
        s.append(b, document.createTextNode(label));
        return s;
      };
      if (data.loggedIn) {
        summary.append(
          stat(`${craft.length - craftMissing.length}/${craft.length}`, 'Craft picks at 4x'),
          stat(String(craftMissing.length), 'Craft picks to get'),
          stat(String(keepMissing.length), 'Keep picks under 4x')
        );
      } else {
        summary.append(stat('–', 'Log in to compare with your collection'));
      }
      body.appendChild(summary);

      const controls = document.createElement('div');
      controls.className = 'gh-kos-controls';
      const tabs = document.createElement('div');
      tabs.className = 'gh-tabs';
      for (const side of ['All', 'Plants', 'Zombies']) {
        const b = document.createElement('button');
        b.textContent = side;
        b.setAttribute('aria-pressed', String(sideFilter === side));
        b.addEventListener('click', () => {
          sideFilter = side;
          render();
        });
        tabs.appendChild(b);
      }
      const toggle = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = onlyMissing;
      cb.disabled = !data.loggedIn;
      cb.addEventListener('change', () => {
        onlyMissing = cb.checked;
        render();
      });
      toggle.append(cb, document.createTextNode('Only cards I\'m missing'));
      controls.append(tabs, toggle);
      body.appendChild(controls);

      let shown = 0;
      for (const c of data.classes) {
        if (sideFilter !== 'All' && c.side !== sideFilter) continue;
        const box = document.createElement('div');
        box.className = 'gh-kos-class';
        const head = document.createElement('div');
        head.className = 'gh-kos-class-head';
        const h = document.createElement('h4');
        h.textContent = `${c.cls}`;
        const sideEl = document.createElement('span');
        sideEl.className = 'gh-muted';
        sideEl.style.fontSize = '11px';
        sideEl.textContent = c.side;
        head.append(h, sideEl);
        box.appendChild(head);

        let classHasRows = false;
        for (const tier of TIERS) {
          let picks = c.picks.filter((p) => p.tier === tier.key);
          if (onlyMissing && data.loggedIn) picks = picks.filter((p) => p.known && p.qty < 4);
          if (!picks.length) continue;
          classHasRows = true;
          const row = document.createElement('div');
          row.className = 'gh-kos-tier';
          const label = document.createElement('div');
          label.className = `gh-kos-tier-label gh-muted ${tier.key}`;
          label.textContent = tier.label;
          label.title = `${tier.group}: ${tier.hint}`;
          const chips = document.createElement('div');
          chips.className = 'gh-kos-chips';
          for (const p of picks) {
            const chip = document.createElement('span');
            chip.className = `gh-kos-chip ${chipClass(p)}`;
            chip.textContent = p.qty === null || !p.known ? p.displayName : `${p.displayName} ${Math.min(p.qty, 4)}/4`;
            chip.title = p.known ? p.note : `${p.note}\n\n(Not found in the card database by this exact name.)`;
            chips.appendChild(chip);
          }
          row.append(label, chips);
          box.appendChild(row);
        }
        if (classHasRows) {
          body.appendChild(box);
          shown++;
        }
      }
      if (!shown) {
        body.appendChild(Object.assign(document.createElement('div'), { className: 'gh-muted', textContent: onlyMissing ? 'Nothing missing here - you have every pick at 4x. 🌱' : 'No guide data.' }));
      }

      const foot = document.createElement('div');
      foot.className = 'gh-kos-foot gh-muted';
      foot.textContent =
        'Shows the cards the guide highlights in its written notes, not every card in each tier (the full list is only in the guide image on /keeporscrap). Hover a card for the guide\'s note.';
      body.appendChild(foot);
    }

    function load(force = false) {
      if (loading && !force) return loading;
      loading = loadData(api)
        .then((d) => {
          data = d;
          if (modal.isOpen()) render();
        })
        .catch((err) => {
          loading = null;
          log(`failed to load: ${err.message}`, 'error');
          modal.body.textContent = `Couldn't load the guide: ${err.message}`;
        });
      return loading;
    }

    function open() {
      onlyMissing = options.get('onlyMissing');
      modal.open();
      render();
      load();
    }

    const removeTile = addDashboardTile({ id: 'keep-or-scrap-advisor', label: 'Keep or Scrap Advisor', action: 'Check →', onClick: open });
    const offCollection = onCollectionChanged(() => {
      data = null;
      loading = null;
      if (modal.isOpen()) {
        render();
        load();
      }
    });

    return () => {
      removeTile();
      offCollection();
      modal.destroy();
    };
  },
});

export { parseGuide };
