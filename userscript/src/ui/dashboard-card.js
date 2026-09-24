// Injects a "Mod Settings" card into the site's own /dashboard grid,
// styled identically to "My Decklists" / "My Card Collection" by reusing
// the site's own CSS classes (user-dashboard-grid / user-dashboard-card /
// user-dashboard-card-label / user-dashboard-card-action) rather than
// inventing new styles. Clicking it opens the settings panel (see
// settings-panel.js) instead of navigating to a new route, since this mod
// has no server-rendered page of its own.
//
// Only mounts on /dashboard, and only once the site has actually rendered
// its own grid (SPA route, so the grid may not exist yet on first call —
// this polls briefly via MutationObserver instead of a fixed sleep).

const GRID_SELECTOR = '.user-dashboard-grid';
const CARD_MARKER_ATTR = 'data-pvzhtbot-mod-card';

function buildCard(onOpenSettings) {
  const card = document.createElement('a');
  card.href = '#';
  card.className = 'user-dashboard-card';
  card.setAttribute(CARD_MARKER_ATTR, 'true');

  const label = document.createElement('span');
  label.className = 'user-dashboard-card-label';
  label.textContent = 'Mod Settings';

  const action = document.createElement('span');
  action.className = 'user-dashboard-card-action';
  action.textContent = 'Configure →';

  card.appendChild(label);
  card.appendChild(action);

  card.addEventListener('click', (e) => {
    e.preventDefault();
    onOpenSettings();
  });

  return card;
}

function isDashboardHome() {
  return location.pathname === '/dashboard' || location.pathname === '/dashboard/';
}

/**
 * Mounts the dashboard card and keeps it correctly present/absent across
 * client-side (SPA) navigation, since the site is a React app that
 * doesn't reload the page when moving between /dashboard,
 * /dashboard/card-manager, /profile/*, etc. A single MutationObserver on
 * <body> re-checks both "did the URL change" and "does the grid exist
 * now" on every DOM mutation, which is cheap enough for occasional route
 * changes and avoids depending on the site's internal router.
 */
function mountDashboardCard(onOpenSettings) {
  function tryInject() {
    if (!isDashboardHome()) return;
    const grid = document.querySelector(GRID_SELECTOR);
    if (!grid) return;
    if (grid.querySelector(`[${CARD_MARKER_ATTR}]`)) return;
    grid.appendChild(buildCard(onOpenSettings));
  }

  tryInject();

  const observer = new MutationObserver(() => tryInject());
  observer.observe(document.body, { childList: true, subtree: true });

  return () => observer.disconnect();
}

export { mountDashboardCard };
