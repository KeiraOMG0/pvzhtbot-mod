// Shared toast notifications (bottom-left stack), so plugins don't each
// invent their own popup. Plain DOM, styles injected once.
//
//   showToast({ title, body, kind: 'info'|'success'|'warn'|'error',
//               timeoutMs: 6000 (0 = sticky), actions: [{ label, onClick }] })
//   -> { close() }

import { THEME } from '../core/brand.js';

const STACK_ID = 'greenhouse-toast-stack';
const STYLE_ID = 'greenhouse-toast-styles';

const KIND_COLORS = {
  info: THEME.border,
  success: THEME.accentBorder,
  warn: THEME.warnBorder,
  error: THEME.dangerBorder,
};
const KIND_TITLE = {
  info: THEME.text,
  success: THEME.accent,
  warn: THEME.warn,
  error: THEME.danger,
};

const STYLES = `
#${STACK_ID} {
  position: fixed; left: 16px; bottom: 16px; z-index: 1000000;
  display: flex; flex-direction: column-reverse; gap: 8px;
  max-width: min(360px, calc(100vw - 32px));
  pointer-events: none;
}
#${STACK_ID} .gh-toast {
  pointer-events: auto;
  background: ${THEME.bg}; color: ${THEME.text};
  border: 1px solid ${THEME.border}; border-left-width: 4px;
  border-radius: 8px; padding: 10px 12px;
  font: ${THEME.font}; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}
#${STACK_ID} .gh-toast-title { font-weight: 600; margin-bottom: 2px; }
#${STACK_ID} .gh-toast-body { color: #ccc; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
#${STACK_ID} .gh-toast-actions { display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px; flex-wrap: wrap; }
#${STACK_ID} .gh-toast-actions button {
  border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 12px;
  background: #262626; color: #ddd;
}
#${STACK_ID} .gh-toast-actions button:first-child { background: ${THEME.accentStrong}; color: #fff; }
`;

function ensureStack() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }
  let stack = document.getElementById(STACK_ID);
  if (!stack) {
    stack = document.createElement('div');
    stack.id = STACK_ID;
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast({ title, body = '', kind = 'info', timeoutMs = 6000, actions = [] } = {}) {
  const stack = ensureStack();
  const el = document.createElement('div');
  el.className = 'gh-toast';
  el.style.borderLeftColor = KIND_COLORS[kind] || KIND_COLORS.info;

  if (title) {
    const t = document.createElement('div');
    t.className = 'gh-toast-title';
    t.style.color = KIND_TITLE[kind] || KIND_TITLE.info;
    t.textContent = title;
    el.appendChild(t);
  }
  if (body) {
    const b = document.createElement('div');
    b.className = 'gh-toast-body';
    b.textContent = body;
    el.appendChild(b);
  }

  let timer = null;
  const close = () => {
    clearTimeout(timer);
    el.remove();
  };

  const allActions = [...actions, { label: 'Dismiss', onClick: () => {} }];
  const row = document.createElement('div');
  row.className = 'gh-toast-actions';
  for (const action of allActions) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      try {
        action.onClick?.();
      } finally {
        if (action.keepOpen !== true) close();
      }
    });
    row.appendChild(btn);
  }
  el.appendChild(row);

  stack.appendChild(el);
  if (timeoutMs > 0) timer = setTimeout(close, timeoutMs);
  return { close };
}

export { showToast };
