// Greenhouse settings panel: a centered modal listing every registered
// plugin with an enable/disable toggle, a search box, and - for plugins
// that declare `options` - an expandable settings section rendered
// automatically from that schema (see core/define-plugin.js). Opened only
// from the /dashboard card (see dashboard-card.js); no floating button on
// other pages by design.
//
// No framework dependency - plain DOM, scoped styles under a unique id.

import { BRAND, THEME } from '../core/brand.js';

const PANEL_ID = 'pvzhtbot-mod-settings-panel';
const BACKDROP_ID = 'pvzhtbot-mod-settings-backdrop';
const P = `#${PANEL_ID}`;

const STYLES = `
#${BACKDROP_ID} { position: fixed; inset: 0; z-index: 999998; background: rgba(0,0,0,0.5); }
${P} {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: 999999; width: min(480px, calc(100vw - 32px)); max-height: 80vh;
  display: flex; flex-direction: column;
  background: ${THEME.bg}; color: ${THEME.text};
  border: 1px solid ${THEME.border}; border-top: 3px solid ${THEME.accent};
  border-radius: 8px; font: ${THEME.font}; box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
${P} .gh-head { padding: 14px 16px 10px; border-bottom: 1px solid ${THEME.border}; }
${P} .gh-title-row { display: flex; justify-content: space-between; align-items: center; }
${P} .gh-brand { display: flex; align-items: baseline; gap: 8px; }
${P} .gh-brand h3 { margin: 0; font-size: 16px; color: ${THEME.accent}; letter-spacing: 0.3px; }
${P} .gh-brand span { color: ${THEME.textMuted}; font-size: 11px; }
${P} .gh-close { background: none; border: none; color: #999; font-size: 18px; cursor: pointer; line-height: 1; }
${P} .gh-close:hover { color: ${THEME.text}; }
${P} .gh-search {
  margin-top: 10px; width: 100%; box-sizing: border-box; padding: 6px 8px;
  background: ${THEME.bgRaised}; color: ${THEME.text}; border: 1px solid ${THEME.border}; border-radius: 4px;
}
${P} .gh-body { overflow-y: auto; padding: 4px 16px; flex: 1; }
${P} .gh-row { padding: 9px 0; border-bottom: 1px solid #22252a; }
${P} .gh-row:last-child { border-bottom: none; }
${P} .gh-row-main { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
${P} .gh-name { font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
${P} .gh-desc { color: ${THEME.textMuted}; font-size: 11px; margin-top: 2px; }
${P} .gh-meta { color: #777; font-size: 10px; margin-top: 2px; }
${P} .gh-controls { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
${P} .gh-badge { font-size: 10px; border-radius: 4px; padding: 1px 6px; white-space: nowrap; font-weight: 500; }
${P} .gh-badge-required { color: ${THEME.accent}; border: 1px solid ${THEME.accentBorder}; }
${P} .gh-badge-user { color: #9bc3e2; border: 1px solid #2f4a5a; }
${P} .gh-badge-crash { color: ${THEME.danger}; border: 1px solid ${THEME.dangerBorder}; background: ${THEME.dangerBg}; cursor: help; }
${P} .gh-gear {
  background: none; border: 1px solid ${THEME.border}; color: #bbb; border-radius: 4px;
  cursor: pointer; padding: 1px 6px; font-size: 12px;
}
${P} .gh-gear[aria-expanded="true"] { border-color: ${THEME.accentBorder}; color: ${THEME.accent}; }
${P} .gh-options {
  margin-top: 8px; padding: 8px 10px; background: ${THEME.bgRaised};
  border: 1px solid ${THEME.border}; border-radius: 6px; display: flex; flex-direction: column; gap: 8px;
}
${P} .gh-opt { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
${P} .gh-opt-label { font-size: 12px; }
${P} .gh-opt-desc { color: ${THEME.textMuted}; font-size: 10px; }
${P} .gh-opt input[type="number"], ${P} .gh-opt input[type="text"], ${P} .gh-opt select {
  background: ${THEME.bg}; color: ${THEME.text}; border: 1px solid ${THEME.border}; border-radius: 4px; padding: 3px 6px;
}
${P} .gh-opt input[type="number"] { width: 70px; }
${P} .gh-reset { align-self: flex-end; background: none; border: none; color: #888; font-size: 11px; cursor: pointer; text-decoration: underline; }
${P} .gh-empty { color: #999; font-style: italic; padding: 12px 0; }
${P} .gh-notice {
  margin: 8px 16px 0; padding: 8px 10px; background: ${THEME.warnBg}; border: 1px solid ${THEME.warnBorder};
  border-radius: 6px; color: ${THEME.warn}; display: flex; justify-content: space-between; align-items: center; gap: 8px;
}
${P} .gh-notice button {
  background: ${THEME.accentStrong}; color: #fff; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 12px; white-space: nowrap;
}
${P} .gh-foot { padding: 10px 16px 12px; border-top: 1px solid ${THEME.border}; color: #777; font-size: 10px; line-height: 1.4; }
${P} .gh-foot a { color: #9a9a9a; }
`;

function injectStylesOnce() {
  if (document.getElementById(`${PANEL_ID}-styles`)) return;
  const style = document.createElement('style');
  style.id = `${PANEL_ID}-styles`;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

function renderOptionControl(pluginId, key, schema, pluginManager, onChanged) {
  const value = pluginManager.getOption(pluginId, key);
  const commit = (v) => {
    pluginManager.setOption(pluginId, key, v);
    onChanged(schema);
  };

  if (schema.type === 'boolean') {
    const input = el('input', { type: 'checkbox' });
    input.checked = Boolean(value);
    input.addEventListener('change', () => commit(input.checked));
    return input;
  }
  if (schema.type === 'number') {
    const input = el('input', { type: 'number' });
    if (typeof schema.min === 'number') input.min = schema.min;
    if (typeof schema.max === 'number') input.max = schema.max;
    if (typeof schema.step === 'number') input.step = schema.step;
    input.value = value;
    input.addEventListener('change', () => {
      commit(input.value);
      input.value = pluginManager.getOption(pluginId, key); // show the clamped value
    });
    return input;
  }
  if (schema.type === 'select') {
    const select = el('select');
    for (const choice of schema.choices) {
      const opt = el('option', { text: choice.label });
      opt.value = String(choice.value);
      if (choice.value === value) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      const choice = schema.choices.find((c) => String(c.value) === select.value);
      commit(choice ? choice.value : schema.default);
    });
    return select;
  }
  const input = el('input', { type: 'text' });
  input.value = value;
  input.addEventListener('change', () => commit(input.value));
  return input;
}

function renderOptions(info, pluginManager, onChanged, rerender) {
  const box = el('div', { class: 'gh-options' });
  for (const [key, schema] of Object.entries(info.options)) {
    const label = el('div', {}, [
      el('div', { class: 'gh-opt-label', text: schema.label || key }),
      schema.description ? el('div', { class: 'gh-opt-desc', text: schema.description }) : null,
    ]);
    box.appendChild(
      el('label', { class: 'gh-opt' }, [label, renderOptionControl(info.id, key, schema, pluginManager, onChanged)])
    );
  }
  box.appendChild(
    el('button', {
      class: 'gh-reset',
      text: 'Reset to defaults',
      onclick: () => {
        pluginManager.resetOptions(info.id);
        onChanged({ restartNeeded: Object.values(info.options).some((o) => o.restartNeeded) });
        rerender();
      },
    })
  );
  return box;
}

function renderPluginRow(info, ctx) {
  const { pluginManager, expanded, onToggle, onOptionChanged, rerender } = ctx;
  const hasOptions = Object.keys(info.options).length > 0;
  const isOpen = expanded.has(info.id);

  const nameRow = el('div', { class: 'gh-name' }, [document.createTextNode(info.name)]);
  if (!info.builtIn) nameRow.appendChild(el('span', { class: 'gh-badge gh-badge-user', text: 'User' }));
  if (info.lastError) {
    nameRow.appendChild(
      el('span', {
        class: 'gh-badge gh-badge-crash',
        text: 'Crashed',
        title: `${info.lastError.phase}: ${info.lastError.message}`,
      })
    );
  }

  const meta = [];
  if (info.authors.length) meta.push(`by ${info.authors.join(', ')}`);
  if (info.dependencies.length) meta.push(`needs ${info.dependencies.join(', ')}`);

  const left = el('div', {}, [
    nameRow,
    info.description ? el('div', { class: 'gh-desc', text: info.description }) : null,
    meta.length ? el('div', { class: 'gh-meta', text: meta.join(' · ') }) : null,
  ]);

  const controls = el('div', { class: 'gh-controls' });
  if (hasOptions) {
    controls.appendChild(
      el('button', {
        class: 'gh-gear',
        text: '⚙',
        title: 'Plugin settings',
        'aria-expanded': String(isOpen),
        onclick: () => {
          if (isOpen) expanded.delete(info.id);
          else expanded.add(info.id);
          rerender();
        },
      })
    );
  }
  if (info.required) {
    controls.appendChild(el('span', { class: 'gh-badge gh-badge-required', text: 'Required' }));
  } else {
    const checkbox = el('input', { type: 'checkbox', title: info.enabled ? 'Disable' : 'Enable' });
    checkbox.checked = info.enabled;
    checkbox.addEventListener('change', () => onToggle(info.id, checkbox.checked));
    controls.appendChild(checkbox);
  }

  const row = el('div', { class: 'gh-row' }, [el('div', { class: 'gh-row-main' }, [left, controls])]);
  if (hasOptions && isOpen) row.appendChild(renderOptions(info, pluginManager, onOptionChanged, rerender));
  return row;
}

/**
 * Creates (once) the settings panel DOM. Returns { open, close, toggle,
 * isOpen }.
 */
function createSettingsPanel(pluginManager) {
  injectStylesOnce();

  let panel = document.getElementById(PANEL_ID);
  let backdrop = document.getElementById(BACKDROP_ID);
  if (!panel || !backdrop) {
    backdrop = el('div', { id: BACKDROP_ID });
    backdrop.style.display = 'none';
    document.body.appendChild(backdrop);
    panel = el('div', { id: PANEL_ID });
    panel.style.display = 'none';
    document.body.appendChild(panel);
  }

  // Tracks whether something changed this "open" session that only fully
  // applies after a refresh, so we can offer one instead of silently
  // leaving stale plugin state in the DOM.
  let needsRefresh = false;
  let query = '';
  const expanded = new Set();

  function matches(info) {
    if (!query) return true;
    const hay = [info.name, info.id, info.description, ...info.tags, ...info.authors].join(' ').toLowerCase();
    return hay.includes(query);
  }

  function render() {
    const prevScroll = panel.querySelector('.gh-body')?.scrollTop || 0;
    const hadFocus = document.activeElement?.classList?.contains('gh-search');
    panel.innerHTML = '';

    const search = el('input', { class: 'gh-search', type: 'search', placeholder: 'Search plugins…' });
    search.value = query;
    search.addEventListener('input', () => {
      query = search.value.trim().toLowerCase();
      render();
    });

    const plugins = pluginManager.list();
    const enabledCount = plugins.filter((p) => p.enabled).length;
    panel.appendChild(
      el('div', { class: 'gh-head' }, [
        el('div', { class: 'gh-title-row' }, [
          el('div', { class: 'gh-brand' }, [
            el('h3', { text: `🌱 ${BRAND.name}` }),
            el('span', { text: `${enabledCount}/${plugins.length} plugins on` }),
          ]),
          el('button', { class: 'gh-close', text: '✕', title: 'Close', onclick: close }),
        ]),
        search,
      ])
    );

    const body = el('div', { class: 'gh-body' });
    const visible = plugins.filter(matches);
    if (plugins.length === 0) {
      body.appendChild(el('div', { class: 'gh-empty', text: 'No plugins registered yet.' }));
    } else if (visible.length === 0) {
      body.appendChild(el('div', { class: 'gh-empty', text: `No plugins match "${query}".` }));
    }
    const rowCtx = {
      pluginManager,
      expanded,
      rerender: render,
      onToggle: async (id, enabled) => {
        try {
          await pluginManager.setEnabled(id, enabled);
        } finally {
          needsRefresh = true;
          render();
        }
      },
      onOptionChanged: (schema) => {
        if (schema?.restartNeeded) {
          needsRefresh = true;
          render();
        }
      },
    };
    for (const info of visible) body.appendChild(renderPluginRow(info, rowCtx));
    panel.appendChild(body);

    if (needsRefresh) {
      panel.appendChild(
        el('div', { class: 'gh-notice' }, [
          el('span', { text: 'Some changes fully apply only after a page refresh.' }),
          el('button', { text: 'Refresh now', onclick: () => location.reload() }),
        ])
      );
    }

    const foot = el('div', { class: 'gh-foot' }, [
      document.createTextNode(`${BRAND.disclaimer} `),
      el('a', { href: BRAND.repoUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Source' }),
    ]);
    panel.appendChild(foot);

    const newBody = panel.querySelector('.gh-body');
    if (newBody) newBody.scrollTop = prevScroll;
    if (hadFocus) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  function open() {
    needsRefresh = false;
    render();
    backdrop.style.display = 'block';
    panel.style.display = 'flex';
    document.addEventListener('keydown', onKey);
  }

  function close() {
    backdrop.style.display = 'none';
    panel.style.display = 'none';
    document.removeEventListener('keydown', onKey);
  }

  function toggle() {
    if (panel.style.display === 'none') open();
    else close();
  }

  backdrop.onclick = close;

  return { open, close, toggle, isOpen: () => panel.style.display !== 'none', refresh: render };
}

export { createSettingsPanel };
