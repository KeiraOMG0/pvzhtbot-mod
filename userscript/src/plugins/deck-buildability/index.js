// Deck Buildability Helper
//
// The site's own /decklists page has a "Collection" filter with "Can
// Build (N)" and "Close to Building (X%) (N)" options — confirmed to be
// entirely client-side (no API call fires when you pick one; see
// site-research/docs/decklists.md). But that page only shows a count and
// requires filtering deck-by-deck; it doesn't rank decks by how close you
// are, and it's buried on a separate page from the dashboard.
//
// This plugin adds a "Deck Buildability" card to /dashboard (matching the
// site's own card styling) that, on click, shows every public community
// deck ranked by % of its 12 cards you own, with exactly which cards are
// missing and how many. Fully derived from GET /decklists/ +
// GET /user-cards/ (both confirmed, read-only). Never writes anything.

const MARKER_ATTR = 'data-pvzhtbot-deck-buildability-card';
const STYLE_ID = 'pvzhtbot-deck-buildability-styles';
const PANEL_ID = 'pvzhtbot-deck-buildability-panel';
const BACKDROP_ID = 'pvzhtbot-deck-buildability-backdrop';
const GRID_SELECTOR = '.user-dashboard-grid';

const STYLES = `
#${BACKDROP_ID} {
  position: fixed;
  inset: 0;
  z-index: 999997;
  background: rgba(0,0,0,0.5);
}
#${PANEL_ID} {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 999997;
  width: min(720px, 92vw);
  max-height: 80vh;
  overflow-y: auto;
  background: #14161a;
  color: #eee;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px 20px;
  font: 13px system-ui, sans-serif;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
#${PANEL_ID} .pvzhtbot-db-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
#${PANEL_ID} h3 { margin: 0; font-size: 16px; }
#${PANEL_ID} .pvzhtbot-db-close {
  background: none; border: none; color: #999; font-size: 18px; cursor: pointer; line-height: 1;
}
#${PANEL_ID} .pvzhtbot-db-close:hover { color: #eee; }
#${PANEL_ID} .pvzhtbot-db-subtitle { color: #999; font-size: 12px; margin-bottom: 12px; }
#${PANEL_ID} .pvzhtbot-db-filters { display: flex; gap: 8px; margin-bottom: 12px; }
#${PANEL_ID} .pvzhtbot-db-filters button {
  background: #1f2125; border: 1px solid #333; color: #ccc; border-radius: 4px;
  padding: 4px 10px; font-size: 12px; cursor: pointer;
}
#${PANEL_ID} .pvzhtbot-db-filters button.active { background: #1f6f3f; color: #fff; border-color: #1f6f3f; }
#${PANEL_ID} .pvzhtbot-db-search {
  width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 8px 10px;
  background: #1f2125; border: 1px solid #333; border-radius: 6px; color: #eee; font: 13px system-ui, sans-serif;
}
#${PANEL_ID} .pvzhtbot-db-search:focus { outline: none; border-color: #1f6f3f; }
#${PANEL_ID} .pvzhtbot-db-search::placeholder { color: #777; }
#${PANEL_ID} .pvzhtbot-db-deck {
  border: 1px solid #262626; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px;
  cursor: pointer;
}
#${PANEL_ID} .pvzhtbot-db-deck:hover { border-color: #3a3a3a; }
#${PANEL_ID} .pvzhtbot-db-deck-row { display: flex; gap: 12px; align-items: flex-start; }
#${PANEL_ID} .pvzhtbot-db-deck-thumb { width: 48px; height: 48px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
#${PANEL_ID} .pvzhtbot-db-deck-main { flex: 1; min-width: 0; }
#${PANEL_ID} .pvzhtbot-db-deck-name { font-weight: 600; }
#${PANEL_ID} .pvzhtbot-db-deck-name::before { content: '▶ '; display: inline-block; font-size: 10px; color: #777; }
#${PANEL_ID} .pvzhtbot-db-deck.expanded .pvzhtbot-db-deck-name::before { content: '▼ '; }
#${PANEL_ID} .pvzhtbot-db-deck-meta { color: #999; font-size: 11px; margin-top: 1px; }
#${PANEL_ID} .pvzhtbot-db-deck-pct { font-weight: 700; white-space: nowrap; }
#${PANEL_ID} .pvzhtbot-db-deck-pct.full { color: #6fd88a; }
#${PANEL_ID} .pvzhtbot-db-deck-pct.partial { color: #e0c96a; }
#${PANEL_ID} .pvzhtbot-db-missing { margin-top: 6px; font-size: 11px; color: #d99; }
#${PANEL_ID} .pvzhtbot-db-description {
  margin-top: 10px; padding-top: 10px; border-top: 1px solid #262626;
  font-size: 12px; color: #bbb; line-height: 1.5; white-space: pre-wrap;
}
#${PANEL_ID} .pvzhtbot-db-cardlist {
  margin-top: 10px; padding-top: 10px; border-top: 1px solid #262626;
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px;
}
#${PANEL_ID} .pvzhtbot-db-cardlist-item { display: flex; justify-content: space-between; font-size: 12px; }
#${PANEL_ID} .pvzhtbot-db-cardlist-item.owned { color: #ccc; }
#${PANEL_ID} .pvzhtbot-db-cardlist-item.missing { color: #e0a0a0; }
#${PANEL_ID} .pvzhtbot-db-cardlist-qty { color: #777; margin-left: 8px; white-space: nowrap; }
#${PANEL_ID} .pvzhtbot-db-empty, #${PANEL_ID} .pvzhtbot-db-loading { color: #999; font-style: italic; }
#${PANEL_ID} .pvzhtbot-db-error { color: #e08080; }
#${PANEL_ID} .pvzhtbot-db-more-btn {
  display: block; width: 100%; margin-top: 4px; padding: 8px;
  background: #1f2125; border: 1px solid #333; color: #ccc; border-radius: 6px;
  cursor: pointer; font-size: 12px;
}
#${PANEL_ID} .pvzhtbot-db-more-btn:hover { background: #262a2e; border-color: #444; }
`;

function injectStylesOnce() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function isDashboardHome() {
  return location.pathname === '/dashboard' || location.pathname === '/dashboard/';
}

function parseDeckCards(cardsField) {
  return cardsField
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, qtyStr] = line.split('|');
      return { name: name.trim(), quantity: parseInt(qtyStr, 10) || 0 };
    });
}

async function computeBuildability(api) {
  const [decklists, myCardsRes] = await Promise.all([api.getAllDecklists(), api.getMyCards()]);
  // Keyed by card_name alone (not name+side): verified empirically against
  // the full ~594-card database that every card_name is globally unique
  // across both sides, no collisions. Not guaranteed by the API schema -
  // if a future game update ever reuses a name across Plants/Zombie, this
  // would need to become a composite key.
  const ownedQty = new Map(myCardsRes.cards.map((c) => [c.card_name, c.quantity]));

  return decklists
    .map((deck) => {
      const parsedCards = parseDeckCards(deck.cards);
      let totalNeeded = 0;
      let totalOwned = 0;
      const missing = [];
      const cardStatus = [];

      for (const { name, quantity } of parsedCards) {
        totalNeeded += quantity;
        const owned = ownedQty.get(name) || 0;
        const usable = Math.min(owned, quantity);
        totalOwned += usable;
        const isMissing = usable < quantity;
        if (isMissing) missing.push({ name, need: quantity, have: owned });
        cardStatus.push({ name, quantity, owned, missing: isMissing });
      }

      const pct = totalNeeded === 0 ? 0 : Math.round((totalOwned / totalNeeded) * 100);
      return { deck, pct, missing, cardStatus, canBuild: missing.length === 0 };
    })
    .sort((a, b) => b.pct - a.pct);
}

function buildCardListSection(entry) {
  const section = document.createElement('div');
  section.className = 'pvzhtbot-db-cardlist';

  for (const card of entry.cardStatus) {
    const item = document.createElement('div');
    item.className = `pvzhtbot-db-cardlist-item ${card.missing ? 'missing' : 'owned'}`;

    const nameEl = document.createElement('span');
    nameEl.textContent = card.name;

    const qtyEl = document.createElement('span');
    qtyEl.className = 'pvzhtbot-db-cardlist-qty';
    qtyEl.textContent = card.missing ? `${card.owned}/${card.quantity}` : `${card.quantity}x`;

    item.appendChild(nameEl);
    item.appendChild(qtyEl);
    section.appendChild(item);
  }

  return section;
}

function buildDeckRow(entry) {
  const row = document.createElement('div');
  row.className = 'pvzhtbot-db-deck';

  const clickRow = document.createElement('div');
  clickRow.className = 'pvzhtbot-db-deck-row';

  if (entry.deck.image) {
    const thumb = document.createElement('img');
    thumb.className = 'pvzhtbot-db-deck-thumb';
    thumb.src = entry.deck.image;
    thumb.alt = '';
    thumb.loading = 'lazy';
    clickRow.appendChild(thumb);
  }

  const main = document.createElement('div');
  main.className = 'pvzhtbot-db-deck-main';

  const nameRow = document.createElement('div');
  nameRow.style.display = 'flex';
  nameRow.style.justifyContent = 'space-between';
  nameRow.style.gap = '8px';

  const name = document.createElement('div');
  name.className = 'pvzhtbot-db-deck-name';
  name.textContent = entry.deck.name;

  const pct = document.createElement('div');
  pct.className = `pvzhtbot-db-deck-pct ${entry.canBuild ? 'full' : 'partial'}`;
  pct.textContent = entry.canBuild ? 'Can build' : `${entry.pct}%`;

  nameRow.appendChild(name);
  nameRow.appendChild(pct);
  main.appendChild(nameRow);

  const meta = document.createElement('div');
  meta.className = 'pvzhtbot-db-deck-meta';
  meta.textContent = `${entry.deck.hero} — ${entry.deck.archetype || entry.deck.category || ''} — by ${entry.deck.creator}`;
  main.appendChild(meta);

  if (!entry.canBuild) {
    const missing = document.createElement('div');
    missing.className = 'pvzhtbot-db-missing';
    missing.textContent = `Missing: ${entry.missing
      .slice(0, 6)
      .map((m) => `${m.name} (${m.have}/${m.need})`)
      .join(', ')}${entry.missing.length > 6 ? `, +${entry.missing.length - 6} more` : ''}`;
    main.appendChild(missing);
  }

  clickRow.appendChild(main);
  row.appendChild(clickRow);

  let descriptionEl = null;
  let cardListEl = null;
  row.addEventListener('click', () => {
    const expanded = row.classList.toggle('expanded');
    if (expanded) {
      if (!descriptionEl && entry.deck.description) {
        descriptionEl = document.createElement('div');
        descriptionEl.className = 'pvzhtbot-db-description';
        descriptionEl.textContent = entry.deck.description;
        row.appendChild(descriptionEl);
      }
      if (!cardListEl) {
        cardListEl = buildCardListSection(entry);
        row.appendChild(cardListEl);
      }
      if (descriptionEl) descriptionEl.style.display = 'block';
      cardListEl.style.display = 'grid';
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      if (descriptionEl) descriptionEl.style.display = 'none';
      if (cardListEl) cardListEl.style.display = 'none';
    }
  });

  return row;
}

function createPanel(api) {
  injectStylesOnce();

  const backdrop = document.createElement('div');
  backdrop.id = BACKDROP_ID;
  const panel = document.createElement('div');
  panel.id = PANEL_ID;

  const PAGE_SIZE = 50;
  let allResults = null;
  let filter = 'all'; // 'all' | 'buildable' | 'close'
  let visibleCount = PAGE_SIZE;
  let searchQuery = '';

  function close() {
    backdrop.remove();
    panel.remove();
  }

  function matchesSearch(entry, query) {
    if (!query) return true;
    const haystack = [
      entry.deck.name,
      entry.deck.hero,
      entry.deck.archetype,
      entry.deck.category,
      entry.deck.creator,
      entry.deck.aliases,
      ...entry.cardStatus.map((c) => c.name),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  }

  function currentFiltered() {
    let results = allResults;
    if (filter === 'buildable') results = results.filter((r) => r.canBuild);
    if (filter === 'close') results = results.filter((r) => !r.canBuild && r.pct >= 70);
    const query = searchQuery.trim().toLowerCase();
    if (query) results = results.filter((r) => matchesSearch(r, query));
    return results;
  }

  function renderList() {
    const list = panel.querySelector('.pvzhtbot-db-list');
    list.innerHTML = '';

    const filtered = currentFiltered();

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pvzhtbot-db-empty';
      empty.textContent = 'No decks match this filter.';
      list.appendChild(empty);
      return;
    }

    for (const entry of filtered.slice(0, visibleCount)) {
      list.appendChild(buildDeckRow(entry));
    }

    if (filtered.length > visibleCount) {
      const remaining = filtered.length - visibleCount;
      const moreBtn = document.createElement('button');
      moreBtn.className = 'pvzhtbot-db-more-btn';
      moreBtn.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more (${remaining} remaining)`;
      moreBtn.addEventListener('click', () => {
        visibleCount += PAGE_SIZE;
        renderList();
      });
      list.appendChild(moreBtn);
    }
  }

  function renderFilters() {
    const filtersEl = panel.querySelector('.pvzhtbot-db-filters');
    filtersEl.innerHTML = '';
    const buildable = allResults.filter((r) => r.canBuild).length;
    const close = allResults.filter((r) => !r.canBuild && r.pct >= 70).length;
    const options = [
      ['all', `All (${allResults.length})`],
      ['buildable', `Can build (${buildable})`],
      ['close', `Close (70%+) (${close})`],
    ];
    for (const [key, label] of options) {
      const btn = document.createElement('button');
      btn.textContent = label;
      if (key === filter) btn.classList.add('active');
      btn.addEventListener('click', () => {
        filter = key;
        visibleCount = PAGE_SIZE;
        renderFilters();
        renderList();
      });
      filtersEl.appendChild(btn);
    }
  }

  async function open() {
    visibleCount = PAGE_SIZE;
    searchQuery = '';
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    backdrop.addEventListener('click', close);

    panel.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'pvzhtbot-db-header';
    const heading = document.createElement('h3');
    heading.textContent = 'Deck Buildability';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'pvzhtbot-db-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', close);
    header.appendChild(heading);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const subtitle = document.createElement('div');
    subtitle.className = 'pvzhtbot-db-subtitle';
    subtitle.textContent = 'Community decks ranked by % of cards you own. Read-only — nothing here is added to your collection.';
    panel.appendChild(subtitle);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'pvzhtbot-db-search';
    searchInput.placeholder = 'Search decks by name, hero, archetype, creator, or card...';
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      visibleCount = PAGE_SIZE;
      renderList();
    });
    panel.appendChild(searchInput);

    const filtersEl = document.createElement('div');
    filtersEl.className = 'pvzhtbot-db-filters';
    panel.appendChild(filtersEl);

    const list = document.createElement('div');
    list.className = 'pvzhtbot-db-list';
    const loading = document.createElement('div');
    loading.className = 'pvzhtbot-db-loading';
    loading.textContent = 'Loading decks and your collection...';
    list.appendChild(loading);
    panel.appendChild(list);

    try {
      allResults = await computeBuildability(api);
      renderFilters();
      renderList();
    } catch (err) {
      list.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.className = 'pvzhtbot-db-error';
      errEl.textContent = `Failed to load: ${err.message}`;
      list.appendChild(errEl);
    }
  }

  return { open };
}

const deckBuildabilityPlugin = {
  id: 'deck-buildability',
  name: 'Deck Buildability Helper',
  description: 'Ranks community decks by how many of their cards you own, with a click-through panel from /dashboard.',
  defaultEnabled: true,

  async init(context) {
    const panelController = createPanel(context.api);

    function buildCard() {
      const card = document.createElement('a');
      card.href = '#';
      card.className = 'user-dashboard-card';
      card.setAttribute(MARKER_ATTR, 'true');

      const label = document.createElement('span');
      label.className = 'user-dashboard-card-label';
      label.textContent = 'Deck Buildability';

      const action = document.createElement('span');
      action.className = 'user-dashboard-card-action';
      action.textContent = 'View →';

      card.appendChild(label);
      card.appendChild(action);
      card.addEventListener('click', (e) => {
        e.preventDefault();
        panelController.open();
      });
      return card;
    }

    function tryInject() {
      if (!isDashboardHome()) return;
      const grid = document.querySelector(GRID_SELECTOR);
      if (!grid) return;
      if (grid.querySelector(`[${MARKER_ATTR}]`)) return;
      grid.appendChild(buildCard());
    }

    tryInject();
    const observer = new MutationObserver(() => tryInject());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.querySelector(`[${MARKER_ATTR}]`)?.remove();
    };
  },
};

export { deckBuildabilityPlugin };
