// Shared centered modal for plugin panels, in Greenhouse's look.
//
//   const modal = createModal({ id: 'my-plugin', title: 'My Plugin', width: 640 });
//   modal.open();               // shows it (creates DOM on first use)
//   modal.body                  // element to render your content into
//   modal.close(); modal.destroy();
//   createModal({ ..., onOpen, onClose })
//
// Esc and clicking the backdrop close it. Plain DOM, no framework.

import { THEME, BRAND } from '../core/brand.js';

const STYLE_ID = 'greenhouse-modal-styles';
const STYLES = `
.gh-modal-backdrop { position: fixed; inset: 0; z-index: 999990; background: rgba(0,0,0,0.55); }
.gh-modal {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 999991;
  max-width: calc(100vw - 32px); max-height: 82vh; display: flex; flex-direction: column;
  background: ${THEME.bg}; color: ${THEME.text}; font: ${THEME.font};
  border: 1px solid ${THEME.border}; border-top: 3px solid ${THEME.accent}; border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
.gh-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid ${THEME.border}; gap: 12px; }
.gh-modal-title { margin: 0; font-size: 15px; font-weight: 600; }
.gh-modal-title small { color: ${THEME.textMuted}; font-weight: 400; font-size: 11px; margin-left: 6px; }
.gh-modal-x { background: none; border: none; color: #999; font-size: 18px; cursor: pointer; line-height: 1; }
.gh-modal-x:hover { color: ${THEME.text}; }
.gh-modal-body { overflow-y: auto; padding: 12px 16px 16px; }
.gh-modal input[type="search"], .gh-modal input[type="text"] {
  width: 100%; box-sizing: border-box; padding: 7px 9px; font: ${THEME.font};
  background: ${THEME.bgRaised}; color: ${THEME.text}; border: 1px solid ${THEME.border}; border-radius: 4px;
}
.gh-modal input:focus { outline: 1px solid ${THEME.accentBorder}; }
.gh-muted { color: ${THEME.textMuted}; }
.gh-pill { display: inline-block; font-size: 10px; border-radius: 10px; padding: 1px 7px; border: 1px solid ${THEME.border}; color: #bbb; white-space: nowrap; }
.gh-pill-ok { color: ${THEME.accent}; border-color: ${THEME.accentBorder}; }
.gh-pill-warn { color: ${THEME.warn}; border-color: ${THEME.warnBorder}; }
.gh-pill-bad { color: ${THEME.danger}; border-color: ${THEME.dangerBorder}; }
.gh-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0; }
.gh-tabs button {
  background: ${THEME.bgRaised}; border: 1px solid ${THEME.border}; color: #ccc; border-radius: 4px;
  padding: 3px 9px; cursor: pointer; font-size: 12px;
}
.gh-tabs button[aria-pressed="true"] { border-color: ${THEME.accentBorder}; color: ${THEME.accent}; }
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function createModal({ id, title, subtitle = '', width = 640, onOpen, onClose } = {}) {
  let backdrop = null;
  let root = null;
  let titleEl = null;
  const body = document.createElement('div');
  body.className = 'gh-modal-body';

  function build() {
    ensureStyles();
    backdrop = document.createElement('div');
    backdrop.className = 'gh-modal-backdrop';
    backdrop.addEventListener('click', close);

    root = document.createElement('div');
    root.className = 'gh-modal';
    root.id = `greenhouse-modal-${id}`;
    root.style.width = `${width}px`;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', title);

    const head = document.createElement('div');
    head.className = 'gh-modal-head';
    titleEl = document.createElement('h3');
    titleEl.className = 'gh-modal-title';
    setTitle(title, subtitle);
    const x = document.createElement('button');
    x.className = 'gh-modal-x';
    x.textContent = '✕';
    x.title = 'Close (Esc)';
    x.addEventListener('click', close);
    head.append(titleEl, x);
    root.append(head, body);
  }

  function setTitle(text, sub = '') {
    if (!titleEl) return;
    titleEl.textContent = text;
    const s = document.createElement('small');
    s.textContent = sub || BRAND.name;
    titleEl.appendChild(s);
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }

  function isOpen() {
    return Boolean(root?.isConnected);
  }

  function open() {
    if (!root) build();
    if (isOpen()) return;
    document.body.append(backdrop, root);
    document.addEventListener('keydown', onKey, true);
    onOpen?.();
  }

  function close() {
    if (!isOpen()) return;
    backdrop.remove();
    root.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
  }

  return { open, close, isOpen, body, setTitle, destroy: close };
}

export { createModal };
