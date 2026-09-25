// Minimal in-page settings panel: a centered modal listing every
// registered plugin with an enable/disable toggle. Opened only from the
// /dashboard "Mod Settings" card (see dashboard-card.js) — there is no
// floating button on other pages by design, to avoid a persistent overlay
// showing up on every page of the site.
//
// No framework dependency - plain DOM, scoped inline styles via a
// dedicated <style> tag with a unique prefix to avoid clashing with the
// host site's CSS.

const PANEL_ID = 'pvzhtbot-mod-settings-panel';
const BACKDROP_ID = 'pvzhtbot-mod-settings-backdrop';

const STYLES = `
#${BACKDROP_ID} {
  position: fixed;
  inset: 0;
  z-index: 999998;
  background: rgba(0,0,0,0.5);
}
#${PANEL_ID} {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 999999;
  width: 380px;
  max-height: 70vh;
  overflow-y: auto;
  background: #14161a;
  color: #eee;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
  font: 13px system-ui, sans-serif;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
#${PANEL_ID} .pvzhtbot-mod-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
#${PANEL_ID} h3 { margin: 0; font-size: 15px; }
#${PANEL_ID} .pvzhtbot-mod-close {
  background: none;
  border: none;
  color: #999;
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
}
#${PANEL_ID} .pvzhtbot-mod-close:hover { color: #eee; }
#${PANEL_ID} .pvzhtbot-mod-plugin-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #262626;
}
#${PANEL_ID} .pvzhtbot-mod-plugin-row:last-child { border-bottom: none; }
#${PANEL_ID} .pvzhtbot-mod-plugin-name { font-weight: 600; }
#${PANEL_ID} .pvzhtbot-mod-plugin-desc { color: #999; font-size: 11px; margin-top: 2px; }
#${PANEL_ID} .pvzhtbot-mod-empty { color: #999; font-style: italic; }
#${PANEL_ID} .pvzhtbot-mod-required-badge {
  font-size: 10px;
  color: #9be29b;
  border: 1px solid #2f5a3a;
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
}
#${PANEL_ID} .pvzhtbot-mod-restart-notice {
  margin-top: 12px;
  padding: 8px 10px;
  background: #2a2410;
  border: 1px solid #4d4420;
  border-radius: 6px;
  color: #e0c96a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
#${PANEL_ID} .pvzhtbot-mod-restart-btn {
  background: #1f6f3f;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
`;

function injectStylesOnce() {
  if (document.getElementById(`${PANEL_ID}-styles`)) return;
  const style = document.createElement('style');
  style.id = `${PANEL_ID}-styles`;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function renderPluginRow(pluginInfo, onToggle) {
  const row = document.createElement('div');
  row.className = 'pvzhtbot-mod-plugin-row';

  const info = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'pvzhtbot-mod-plugin-name';
  name.textContent = pluginInfo.name;
  const desc = document.createElement('div');
  desc.className = 'pvzhtbot-mod-plugin-desc';
  desc.textContent = pluginInfo.description;
  info.appendChild(name);
  if (pluginInfo.description) info.appendChild(desc);

  row.appendChild(info);

  if (pluginInfo.required) {
    const badge = document.createElement('span');
    badge.className = 'pvzhtbot-mod-required-badge';
    badge.textContent = 'Required';
    row.appendChild(badge);
  } else {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = pluginInfo.enabled;
    checkbox.addEventListener('change', () => onToggle(pluginInfo.id, checkbox.checked));
    row.appendChild(checkbox);
  }

  return row;
}

/**
 * Creates (once) the settings panel DOM. Returns { open, close, toggle,
 * isOpen }. `pluginManager` must implement list() and setEnabled(id, bool).
 */
function createSettingsPanel(pluginManager) {
  injectStylesOnce();

  let panel = document.getElementById(PANEL_ID);
  let backdrop = document.getElementById(BACKDROP_ID);
  if (panel && backdrop) {
    return getPanelController(panel, backdrop, pluginManager);
  }

  backdrop = document.createElement('div');
  backdrop.id = BACKDROP_ID;
  backdrop.style.display = 'none';
  document.body.appendChild(backdrop);

  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.display = 'none';
  document.body.appendChild(panel);

  return getPanelController(panel, backdrop, pluginManager);
}

function getPanelController(panel, backdrop, pluginManager) {
  // Tracks whether any toggle happened this "open" session, so we can show
  // a one-time "some plugins may need a page refresh to fully apply"
  // notice instead of silently leaving stale plugin state active/inactive
  // in the DOM until the next natural navigation.
  let changedSinceOpen = false;

  function render() {
    panel.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'pvzhtbot-mod-header';
    const heading = document.createElement('h3');
    heading.textContent = 'PvZHTBot Mod — Plugins';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'pvzhtbot-mod-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', close);
    header.appendChild(heading);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const plugins = pluginManager.list();
    if (plugins.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pvzhtbot-mod-empty';
      empty.textContent = 'No plugins registered yet.';
      panel.appendChild(empty);
    } else {
      for (const p of plugins) {
        panel.appendChild(
          renderPluginRow(p, async (id, enabled) => {
            await pluginManager.setEnabled(id, enabled);
            changedSinceOpen = true;
            render();
          })
        );
      }
    }

    if (changedSinceOpen) {
      const notice = document.createElement('div');
      notice.className = 'pvzhtbot-mod-restart-notice';
      const text = document.createElement('span');
      text.textContent = 'Some plugins fully apply only after a page refresh.';
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'pvzhtbot-mod-restart-btn';
      refreshBtn.textContent = 'Refresh now';
      refreshBtn.addEventListener('click', () => location.reload());
      notice.appendChild(text);
      notice.appendChild(refreshBtn);
      panel.appendChild(notice);
    }
  }

  function open() {
    changedSinceOpen = false;
    render();
    backdrop.style.display = 'block';
    panel.style.display = 'block';
  }

  function close() {
    backdrop.style.display = 'none';
    panel.style.display = 'none';
  }

  function toggle() {
    if (panel.style.display === 'none') open();
    else close();
  }

  backdrop.addEventListener('click', close);

  return { open, close, toggle, isOpen: () => panel.style.display !== 'none' };
}

export { createSettingsPanel };
