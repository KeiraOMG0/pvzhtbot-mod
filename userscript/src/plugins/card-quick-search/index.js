// Card Quick Search - press a hotkey (Ctrl+K by default) on any page of
// the site to pop up a search over the whole card database: name,
// aliases, class, tribe, traits, and ability text. Each result shows
// cost/stats, rarity, the cleaned-up ability text (Discord emoji tags
// turned into words), and how many copies you own.
//
// The site's own /cardinfo page has search too, but you have to navigate
// there first and lose whatever page you were on. This works from
// anywhere (deck pages, card manager, profiles) without leaving it.
//
// Data: GET cardinfo/ (once, on first open) + GET user-cards/ (for owned
// counts, refreshed when the collection changes). Read-only.

import { definePlugin } from '../../core/define-plugin.js';
import { createModal } from '../../ui/modal.js';
import { cleanEmoji, parseStats, normName } from '../../lib/card-text.js';
import { onCollectionChanged } from '../../core/collection-watcher.js';
import { THEME } from '../../core/brand.js';

const STYLE_ID = 'greenhouse-cqs-styles';
const STYLES = `
#greenhouse-modal-card-quick-search .gh-modal-body { padding-top: 10px; }
.gh-cqs-hint { font-size: 11px; margin: 6px 0 8px; }
.gh-cqs-list { display: flex; flex-direction: column; gap: 2px; }
.gh-cqs-row { display: flex; gap: 10px; padding: 7px 8px; border-radius: 6px; cursor: pointer; border: 1px solid transparent; }
.gh-cqs-row[aria-selected="true"] { background: ${THEME.bgRaised}; border-color: ${THEME.accentBorder}; }
.gh-cqs-row img { width: 44px; height: 44px; object-fit: contain; flex-shrink: 0; }
.gh-cqs-main { min-width: 0; flex: 1; }
.gh-cqs-top { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.gh-cqs-name { font-weight: 600; }
.gh-cqs-stats { font-variant-numeric: tabular-nums; color: #ddd; font-size: 12px; }
.gh-cqs-sub { font-size: 11px; margin-top: 1px; }
.gh-cqs-ability { font-size: 12px; color: #ccc; margin-top: 3px; white-space: pre-wrap;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.gh-cqs-row[aria-expanded="true"] .gh-cqs-ability { -webkit-line-clamp: unset; display: block; }
.gh-cqs-flavor { font-size: 11px; font-style: italic; margin-top: 4px; display: none; }
.gh-cqs-row[aria-expanded="true"] .gh-cqs-flavor { display: block; }
.gh-cqs-copy { margin-top: 6px; display: none; background: ${THEME.bg}; color: #ccc; border: 1px solid ${THEME.border}; border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
.gh-cqs-row[aria-expanded="true"] .gh-cqs-copy { display: inline-block; }
`;

const HOTKEYS = {
  'ctrl-k': { label: 'Ctrl+K', test: (e) => (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k' },
  'alt-k': { label: 'Alt+K', test: (e) => e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'k' },
  slash: { label: '/', test: (e) => e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey, skipInInputs: true },
};

function isTypingTarget(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function indexCards(cards) {
  return cards.map((c) => {
    const stats = parseStats(c.stats);
    const ability = cleanEmoji(c.ability);
    const traits = cleanEmoji(c.traits);
    const rarity = String(c.set_rarity || '').replace(/^(\w+)\s*-\s*/, '$1 - ');
    return {
      raw: c,
      name: c.card_name,
      key: normName(c.card_name),
      side: /^plant/i.test(c.side) ? 'Plant' : 'Zombie',
      cls: c.card_type || '',
      tribe: c.description || '',
      traits,
      ability,
      flavor: cleanEmoji(c.flavor_text),
      rarity,
      stats,
      thumb: c.thumbnail,
      aliases: normName(c.aliases === 'NULL' ? '' : c.aliases),
      hay: normName([c.card_name, c.aliases, c.card_type, c.description, traits, ability, rarity].join(' | ')),
    };
  });
}

function search(index, query, limit) {
  const q = normName(query);
  if (!q) return [];
  const words = q.split(' ').filter(Boolean);
  const scored = [];
  for (const card of index) {
    if (!words.every((w) => card.hay.includes(w))) continue;
    let score = 0;
    if (card.key === q) score += 1000;
    else if (card.key.startsWith(q)) score += 500;
    else if (card.key.includes(q)) score += 300;
    else if (card.aliases.split(/,\s*/).some((a) => a === q)) score += 400;
    else if (card.aliases.includes(q)) score += 150;
    else if (words.every((w) => card.key.includes(w))) score += 200;
    score -= card.name.length / 100; // shorter names first among ties
    scored.push([score, card]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, limit).map(([, c]) => c);
}

function statLine(s) {
  const parts = [];
  if (s.cost !== null) parts.push(`${s.cost} cost`);
  if (s.strength !== null || s.health !== null) parts.push(`${s.strength ?? '–'}/${s.health ?? '–'}`);
  return parts.join(' · ');
}

export default definePlugin({
  id: 'card-quick-search',
  name: 'Card Quick Search',
  description: 'Press a hotkey on any page to search every card by name, alias, tribe, trait or ability text - with owned counts.',
  authors: ['Keira'],
  tags: ['cards', 'search'],
  defaultEnabled: true,
  options: {
    hotkey: {
      type: 'select',
      label: 'Hotkey',
      default: 'ctrl-k',
      choices: Object.entries(HOTKEYS).map(([value, h]) => ({ value, label: h.label })),
    },
    showOwned: {
      type: 'boolean',
      label: 'Show how many copies I own',
      default: true,
    },
    maxResults: {
      type: 'number',
      label: 'Max results',
      default: 25,
      min: 5,
      max: 100,
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

    let index = null;
    let indexPromise = null;
    let owned = null; // Map normName -> quantity, null = unknown / logged out
    let results = [];
    let selected = 0;
    const expanded = new Set();

    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search cards, abilities, tribes, traits…';
    const hint = document.createElement('div');
    hint.className = 'gh-cqs-hint gh-muted';
    const list = document.createElement('div');
    list.className = 'gh-cqs-list';

    const modal = createModal({
      id: 'card-quick-search',
      title: 'Card Search',
      width: 620,
      onOpen: () => {
        input.focus();
        input.select();
      },
    });
    modal.body.append(input, hint, list);

    function loadIndex() {
      if (!indexPromise) {
        indexPromise = api
          .getAllCardInfo()
          .then((cards) => {
            index = indexCards(cards);
            render();
          })
          .catch((err) => {
            indexPromise = null;
            hint.textContent = `Couldn't load cards: ${err.message}`;
            throw err;
          });
      }
      return indexPromise;
    }

    async function loadOwned() {
      if (!options.get('showOwned')) return;
      try {
        const res = await api.getMyCards();
        owned = new Map((res.cards || []).map((c) => [normName(c.card_name), c.quantity]));
      } catch {
        owned = null; // logged out, or the endpoint failed - just hide counts
      }
      if (modal.isOpen()) render();
    }

    function ownedPill(card) {
      if (!options.get('showOwned') || !owned) return null;
      if (/hero|token/i.test(card.rarity) || /superpower/i.test(card.tribe)) return null;
      const n = owned.get(card.key) || 0;
      const pill = document.createElement('span');
      pill.className = `gh-pill ${n >= 4 ? 'gh-pill-ok' : n > 0 ? 'gh-pill-warn' : 'gh-pill-bad'}`;
      pill.textContent = n >= 4 ? `owned ${n}` : `owned ${n}/4`;
      return pill;
    }

    function rowFor(card, i) {
      const row = document.createElement('div');
      row.className = 'gh-cqs-row';
      row.setAttribute('aria-selected', String(i === selected));
      row.setAttribute('aria-expanded', String(expanded.has(card.key)));

      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = '';
      img.src = card.thumb;
      img.onerror = () => img.remove();

      const main = document.createElement('div');
      main.className = 'gh-cqs-main';

      const top = document.createElement('div');
      top.className = 'gh-cqs-top';
      const name = document.createElement('span');
      name.className = 'gh-cqs-name';
      name.textContent = card.name;
      const stats = document.createElement('span');
      stats.className = 'gh-cqs-stats';
      stats.textContent = statLine(card.stats);
      top.append(name, stats);
      const pill = ownedPill(card);
      if (pill) top.appendChild(pill);

      const sub = document.createElement('div');
      sub.className = 'gh-cqs-sub gh-muted';
      sub.textContent = [card.side, card.cls, card.tribe, card.rarity, card.traits].filter(Boolean).join(' · ');

      const ability = document.createElement('div');
      ability.className = 'gh-cqs-ability';
      ability.textContent = card.ability;

      const flavor = document.createElement('div');
      flavor.className = 'gh-cqs-flavor gh-muted';
      flavor.textContent = card.flavor;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'gh-cqs-copy';
      copyBtn.textContent = 'Copy name';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(card.name).then(
          () => (copyBtn.textContent = 'Copied!'),
          () => (copyBtn.textContent = 'Copy failed')
        );
      });

      main.append(top, sub);
      if (card.ability) main.appendChild(ability);
      if (card.flavor) main.appendChild(flavor);
      main.appendChild(copyBtn);
      row.append(img, main);

      row.addEventListener('click', () => {
        selected = i;
        toggleExpanded(card);
      });
      return row;
    }

    function toggleExpanded(card) {
      if (expanded.has(card.key)) expanded.delete(card.key);
      else expanded.add(card.key);
      render();
    }

    function render() {
      list.textContent = '';
      if (!index) {
        hint.textContent = 'Loading card database…';
        return;
      }
      const q = input.value;
      results = search(index, q, options.get('maxResults'));
      if (selected >= results.length) selected = Math.max(0, results.length - 1);
      const hk = HOTKEYS[options.get('hotkey')]?.label || 'Ctrl+K';
      if (!q.trim()) {
        hint.textContent = `${index.length} cards. Type to search · ↑↓ to move · Enter to expand · ${hk} toggles · Esc closes`;
      } else {
        hint.textContent = results.length ? `${results.length} match${results.length === 1 ? '' : 'es'}` : 'No matches.';
      }
      results.forEach((card, i) => list.appendChild(rowFor(card, i)));
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', () => {
      selected = 0;
      render();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!results.length) return;
        selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
        render();
      } else if (e.key === 'Enter' && results[selected]) {
        e.preventDefault();
        toggleExpanded(results[selected]);
      }
    });

    function openSearch() {
      modal.open();
      render();
      loadIndex().catch((err) => log(`failed to load cardinfo: ${err.message}`, 'error'));
      if (owned === null) loadOwned();
    }

    function onKeyDown(e) {
      const hotkey = HOTKEYS[options.get('hotkey')] || HOTKEYS['ctrl-k'];
      if (!hotkey.test(e)) return;
      if (hotkey.skipInInputs && isTypingTarget(e.target) && !modal.isOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      if (modal.isOpen()) modal.close();
      else openSearch();
    }

    document.addEventListener('keydown', onKeyDown, true);
    const offCollection = onCollectionChanged(() => {
      owned = null;
      if (modal.isOpen()) loadOwned();
    });
    const offOpt = options.onChange((key) => {
      if (key === 'showOwned' && options.get('showOwned') && owned === null) loadOwned();
      if (modal.isOpen()) render();
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      offCollection();
      offOpt();
      modal.destroy();
    };
  },
});
