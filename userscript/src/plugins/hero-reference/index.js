// Hero Reference
//
// pvzhtbot.com's own /heroinfo page is a static image-heavy grid with no
// search and no per-hero detail view (confirmed during API research:
// there's no per-hero endpoint - the single bulk GET heroinfo/ call
// already contains everything, including every superpower's full text).
// That page is fine for browsing but slow for "what does hero X's power
// do again?" lookups mid-deckbuilding.
//
// This plugin adds a "Hero Reference" card to /dashboard. Clicking it
// opens a searchable panel: type a hero name, superpower name, or any
// word from an effect's text, and matching heroes expand to show their
// full parsed superpower list. Built entirely on the one confirmed
// endpoint (getAllHeroInfo) - no writes, ever.
//
// Superpower parsing: heroinfo's `ability` field concatenates every
// superpower into one string, blocks separated by "\r\n\r\n", each
// block's first line being "<Name> <:ClassTag:id>...". Some blocks are
// token/reminder text (no class tag) rather than real superpowers - see
// site-research/docs/heroes.md for the full research writeup this is
// based on. Only spot-checked against one hero during research, so this
// plugin treats the heuristic as best-effort, not authoritative - a
// malformed block just renders as-is rather than being hidden.

const MARKER_ATTR = 'data-pvzhtbot-hero-reference-card';
const STYLE_ID = 'pvzhtbot-hero-reference-styles';
const PANEL_ID = 'pvzhtbot-hero-reference-panel';
const BACKDROP_ID = 'pvzhtbot-hero-reference-backdrop';
const GRID_SELECTOR = '.user-dashboard-grid';

const STYLES = `
#${BACKDROP_ID} {
  position: fixed; inset: 0; z-index: 999996; background: rgba(0,0,0,0.5);
}
#${PANEL_ID} {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: 999996; width: min(680px, 92vw); max-height: 80vh; overflow-y: auto;
  background: #14161a; color: #eee; border: 1px solid #333; border-radius: 8px;
  padding: 16px 20px; font: 13px system-ui, sans-serif; box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
#${PANEL_ID} .pvzhtbot-hr-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
#${PANEL_ID} h3 { margin: 0; font-size: 16px; }
#${PANEL_ID} .pvzhtbot-hr-close { background: none; border: none; color: #999; font-size: 18px; cursor: pointer; line-height: 1; }
#${PANEL_ID} .pvzhtbot-hr-close:hover { color: #eee; }
#${PANEL_ID} .pvzhtbot-hr-subtitle { color: #999; font-size: 12px; margin-bottom: 12px; }
#${PANEL_ID} .pvzhtbot-hr-search {
  width: 100%; box-sizing: border-box; margin-bottom: 12px; padding: 8px 10px;
  background: #1f2125; border: 1px solid #333; border-radius: 6px; color: #eee; font: 13px system-ui, sans-serif;
}
#${PANEL_ID} .pvzhtbot-hr-search:focus { outline: none; border-color: #1f6f3f; }
#${PANEL_ID} .pvzhtbot-hr-hero { border: 1px solid #262626; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; }
#${PANEL_ID} .pvzhtbot-hr-hero-row { display: flex; gap: 12px; align-items: center; cursor: pointer; }
#${PANEL_ID} .pvzhtbot-hr-hero-thumb { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
#${PANEL_ID} .pvzhtbot-hr-hero-name { font-weight: 600; }
#${PANEL_ID} .pvzhtbot-hr-hero-name::before { content: '▶ '; font-size: 10px; color: #777; }
#${PANEL_ID} .pvzhtbot-hr-hero.expanded .pvzhtbot-hr-hero-name::before { content: '▼ '; }
#${PANEL_ID} .pvzhtbot-hr-hero-meta { color: #999; font-size: 11px; }
#${PANEL_ID} .pvzhtbot-hr-powers { margin-top: 10px; padding-top: 10px; border-top: 1px solid #262626; }
#${PANEL_ID} .pvzhtbot-hr-power { margin-bottom: 8px; }
#${PANEL_ID} .pvzhtbot-hr-power-title { font-weight: 600; color: #9be29b; font-size: 12px; }
#${PANEL_ID} .pvzhtbot-hr-power-text { font-size: 12px; color: #ccc; margin-top: 2px; white-space: pre-wrap; }
#${PANEL_ID} .pvzhtbot-hr-empty, #${PANEL_ID} .pvzhtbot-hr-loading { color: #999; font-style: italic; }
#${PANEL_ID} .pvzhtbot-hr-error { color: #e08080; }
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

// See site-research/docs/heroes.md for the research this is based on.
// Emoji class/resource tags look like <:Name:1234567890> (e.g.
// <:Strength:...>, <:Brainz:...>, <:Guardian:...>). The research fork
// only checked the title line; live testing here found the SAME tag
// pattern also appears throughout the effect body text (e.g. "+2
// <:Health:...>"), rendering as raw unreadable markup if left alone.
// Replace with just the readable name instead of stripping entirely -
// "+2 Health" reads far better than either "+2 <:Health:1234...>" or a
// silently-vanished "+2 ".
const CLASS_TAG_PATTERN = /<:(\w+):\d+>/g;

function stripEmojiTags(text) {
  return text.replace(CLASS_TAG_PATTERN, '$1');
}

function parseSuperpowers(abilityText) {
  if (!abilityText) return [];
  const blocks = abilityText.split('\r\n\r\n').map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\r\n');
    const [firstLine, ...rest] = lines;
    const hasClassTag = CLASS_TAG_PATTERN.test(firstLine);
    CLASS_TAG_PATTERN.lastIndex = 0; // reset regex state (global flag + test() is stateful)
    const title = stripEmojiTags(firstLine).trim();
    return {
      title: title || '(untitled)',
      text: stripEmojiTags(rest.join('\n')).trim(),
      isLikelySuperpower: hasClassTag,
    };
  });
}

async function loadHeroes(api) {
  const { results } = await api.getAllHeroInfo();
  return results.map((hero) => ({
    ...hero,
    superpowers: parseSuperpowers(hero.ability),
  }));
}

function matchesSearch(hero, query) {
  if (!query) return true;
  const haystack = [
    hero.card_name,
    hero.card_type,
    hero.side,
    ...hero.superpowers.flatMap((p) => [p.title, p.text]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function buildHeroRow(hero) {
  const wrapper = document.createElement('div');
  wrapper.className = 'pvzhtbot-hr-hero';

  const clickRow = document.createElement('div');
  clickRow.className = 'pvzhtbot-hr-hero-row';

  if (hero.thumbnail) {
    const thumb = document.createElement('img');
    thumb.className = 'pvzhtbot-hr-hero-thumb';
    thumb.src = hero.thumbnail;
    thumb.alt = '';
    thumb.loading = 'lazy';
    clickRow.appendChild(thumb);
  }

  const main = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'pvzhtbot-hr-hero-name';
  name.textContent = hero.card_name;
  const meta = document.createElement('div');
  meta.className = 'pvzhtbot-hr-hero-meta';
  meta.textContent = `${hero.side} — ${hero.card_type}`;
  main.appendChild(name);
  main.appendChild(meta);
  clickRow.appendChild(main);

  wrapper.appendChild(clickRow);

  let powersEl = null;
  wrapper.addEventListener('click', () => {
    const expanded = wrapper.classList.toggle('expanded');
    if (expanded) {
      if (!powersEl) {
        powersEl = document.createElement('div');
        powersEl.className = 'pvzhtbot-hr-powers';
        for (const power of hero.superpowers) {
          const powerEl = document.createElement('div');
          powerEl.className = 'pvzhtbot-hr-power';
          const titleEl = document.createElement('div');
          titleEl.className = 'pvzhtbot-hr-power-title';
          titleEl.textContent = power.isLikelySuperpower ? power.title : `${power.title} (token/reminder)`;
          const textEl = document.createElement('div');
          textEl.className = 'pvzhtbot-hr-power-text';
          textEl.textContent = power.text;
          powerEl.appendChild(titleEl);
          powerEl.appendChild(textEl);
          powersEl.appendChild(powerEl);
        }
        wrapper.appendChild(powersEl);
      }
      powersEl.style.display = 'block';
    } else if (powersEl) {
      powersEl.style.display = 'none';
    }
  });

  return wrapper;
}

function createPanel(api) {
  injectStylesOnce();

  const backdrop = document.createElement('div');
  backdrop.id = BACKDROP_ID;
  const panel = document.createElement('div');
  panel.id = PANEL_ID;

  let allHeroes = null;
  let searchQuery = '';

  function close() {
    backdrop.remove();
    panel.remove();
  }

  function renderList() {
    const list = panel.querySelector('.pvzhtbot-hr-list');
    list.innerHTML = '';
    const query = searchQuery.trim().toLowerCase();
    const filtered = allHeroes.filter((h) => matchesSearch(h, query));

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pvzhtbot-hr-empty';
      empty.textContent = 'No heroes match this search.';
      list.appendChild(empty);
      return;
    }

    for (const hero of filtered) {
      list.appendChild(buildHeroRow(hero));
    }
  }

  async function open() {
    searchQuery = '';
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    backdrop.addEventListener('click', close);

    panel.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'pvzhtbot-hr-header';
    const heading = document.createElement('h3');
    heading.textContent = 'Hero Reference';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'pvzhtbot-hr-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', close);
    header.appendChild(heading);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const subtitle = document.createElement('div');
    subtitle.className = 'pvzhtbot-hr-subtitle';
    subtitle.textContent = 'Search heroes and superpowers. Click a hero to see its full superpower text.';
    panel.appendChild(subtitle);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'pvzhtbot-hr-search';
    searchInput.placeholder = 'Search heroes, superpowers, or effect text...';
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      renderList();
    });
    panel.appendChild(searchInput);

    const list = document.createElement('div');
    list.className = 'pvzhtbot-hr-list';
    const loading = document.createElement('div');
    loading.className = 'pvzhtbot-hr-loading';
    loading.textContent = 'Loading heroes...';
    list.appendChild(loading);
    panel.appendChild(list);

    try {
      if (!allHeroes) allHeroes = await loadHeroes(api);
      renderList();
    } catch (err) {
      list.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.className = 'pvzhtbot-hr-error';
      errEl.textContent = `Failed to load: ${err.message}`;
      list.appendChild(errEl);
    }
  }

  return { open };
}

const heroReferencePlugin = {
  id: 'hero-reference',
  name: 'Hero Reference',
  description: 'Searchable hero + superpower lookup from /dashboard, no need to visit the Hero Info page.',
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
      label.textContent = 'Hero Reference';

      const action = document.createElement('span');
      action.className = 'user-dashboard-card-action';
      action.textContent = 'Search →';

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

export { heroReferencePlugin };
