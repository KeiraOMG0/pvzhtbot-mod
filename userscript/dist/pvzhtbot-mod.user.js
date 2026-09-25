// ==UserScript==
// @name         PvZHTBot Mod
// @namespace    https://pvzhtbot.com
// @version      0.2.0
// @description  Collection completion tracker, deck buildability helper, and hero reference for pvzhtbot.com
// @match        https://pvzhtbot.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist/pvzhtbot-mod.user.js
// @downloadURL  https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist/pvzhtbot-mod.user.js
// ==/UserScript==

var __PVZHTBOT_MOD_BUILD_ID__ = "1790306110767";
(() => {
  // src/api/site-api.js
  var PvzhtbotApiError = class extends Error {
    constructor(message, { status, url, body } = {}) {
      super(message);
      this.name = "PvzhtbotApiError";
      this.status = status;
      this.url = url;
      this.body = body;
    }
  };
  var PvzhtbotApi = class {
    constructor({ baseUrl = "https://api.pvzhtbot.com/tbotapp" } = {}) {
      this.baseUrl = baseUrl;
      this._csrfToken = null;
    }
    async _get(path) {
      const url = `${this.baseUrl}${path}`;
      const res = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" }
      });
      if (!res.ok) {
        throw new PvzhtbotApiError(`GET ${path} failed with ${res.status}`, {
          status: res.status,
          url,
          body: await res.text().catch(() => null)
        });
      }
      return res.json();
    }
    async _getCsrfToken({ forceRefresh = false } = {}) {
      if (this._csrfToken && !forceRefresh) return this._csrfToken;
      const data = await this._get("/csrf/");
      this._csrfToken = data.csrfToken;
      if (!this._csrfToken) {
        throw new PvzhtbotApiError("CSRF endpoint did not return a csrfToken", {
          url: `${this.baseUrl}/csrf/`,
          body: data
        });
      }
      return this._csrfToken;
    }
    async _write(method, path, body) {
      const url = `${this.baseUrl}${path}`;
      const token = await this._getCsrfToken();
      const doFetch = (csrfToken) => fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRFToken": csrfToken
        },
        body: JSON.stringify(body)
      });
      let res = await doFetch(token);
      if (!res.ok && res.status === 403) {
        const freshToken = await this._getCsrfToken({ forceRefresh: true });
        res = await doFetch(freshToken);
      }
      if (!res.ok) {
        throw new PvzhtbotApiError(`${method} ${path} failed with ${res.status}`, {
          status: res.status,
          url,
          body: await res.text().catch(() => null)
        });
      }
      return res.json();
    }
    // ---- Identity / session ----
    async getDiscordIdentity() {
      return this._get("/auth/discord/me/");
    }
    async getMyProfile() {
      return this._get("/profile/me/");
    }
    // ---- Profiles ----
    async getProfile(username) {
      return this._get(`/profile/${encodeURIComponent(username)}/`);
    }
    async getProfileDecks(username) {
      return this._get(`/profile/${encodeURIComponent(username)}/decks/`);
    }
    async getProfileCards(username) {
      return this._get(`/profile/${encodeURIComponent(username)}/cards/`);
    }
    // ---- Cards ----
    async getAllCardInfo() {
      return this._get("/cardinfo/");
    }
    async getCardCount() {
      return this._get("/card-count/");
    }
    async getMyCards() {
      return this._get("/user-cards/");
    }
    async getClasses(side) {
      return this._get(`/user-cards/classes/?side=${encodeURIComponent(side)}`);
    }
    async getAvailableCards(side, cardClass) {
      return this._get(
        `/user-cards/available/?side=${encodeURIComponent(side)}&class=${encodeURIComponent(cardClass)}`
      );
    }
    async setCardQuantity(userCardId, quantity) {
      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new PvzhtbotApiError("quantity must be a non-negative integer", { body: { quantity } });
      }
      return this._write("PATCH", `/user-cards/${userCardId}/`, { quantity });
    }
    /**
     * CONFIRMED: POST /user-cards/create/  body {cards: [{card_name, quantity}]}
     * Live-tested with a single new card (201, `{success, created, cards}`).
     * Multi-card-in-one-call and already-owned-conflict behavior are
     * UNCONFIRMED — see site-research/docs/cards.md. This wrapper method
     * only accepts a single card per call by design, to avoid silently
     * enabling bulk writes through an unverified code path. A caller that
     * needs to add several cards must call this once per card and should
     * add its own delay between calls (see addCardsWithRateLimit below).
     */
    async addCard(cardName, quantity) {
      if (typeof cardName !== "string" || !cardName) {
        throw new PvzhtbotApiError("cardName must be a non-empty string", { body: { cardName } });
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new PvzhtbotApiError("quantity must be a positive integer", { body: { quantity } });
      }
      return this._write("POST", "/user-cards/create/", { cards: [{ card_name: cardName, quantity }] });
    }
    /**
     * Adds multiple cards one request at a time with a delay between each
     * call, instead of one large batched request. Exists so any future
     * "add several missing cards" feature is rate-limited by construction
     * rather than relying on the caller to remember to throttle.
     * `delayMs` defaults to 1000ms between requests.
     */
    async addCardsWithRateLimit(items, { delayMs = 1e3, onProgress } = {}) {
      const results = [];
      for (let i = 0; i < items.length; i++) {
        const { cardName, quantity } = items[i];
        const result = await this.addCard(cardName, quantity);
        results.push(result);
        if (onProgress) onProgress(i + 1, items.length, result);
        if (i < items.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
      return results;
    }
    // deleteCard() intentionally omitted: that endpoint is only INFERRED,
    // not confirmed. See site-research/docs/api.md.
    // ---- Decklists ----
    async getAllDecklists() {
      return this._get("/decklists/");
    }
    async getDecklistCount() {
      return this._get("/decklist-count/");
    }
    /** CONFIRMED: GET /user-decks/ - {success, decks: []} - this account's own decks */
    async getMyDecks() {
      return this._get("/user-decks/");
    }
    // createDeck() intentionally omitted: POST .../user-decks/create/ is
    // only INFERRED from bundled-JS string matches, never independently
    // triggered/confirmed. See site-research/docs/decklists.md.
    // ---- Heroes ----
    async getAllHeroInfo() {
      return this._get("/heroinfo/");
    }
  };

  // src/api/backend-client.js
  var BackendClient = class {
    constructor({ baseUrl = null } = {}) {
      this.baseUrl = baseUrl;
      this.enabled = Boolean(baseUrl);
    }
    async _request(path, options = {}) {
      if (!this.enabled) {
        throw new Error(
          `BackendClient is not configured (no baseUrl set) \u2014 cannot call ${path}. Set a backend URL in the mod settings before using backend-dependent features.`
        );
      }
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers || {}
        }
      });
      if (!res.ok) {
        throw new Error(`Backend request to ${path} failed with ${res.status}`);
      }
      return res.json();
    }
    get(path) {
      return this._request(path, { method: "GET" });
    }
    post(path, body) {
      return this._request(path, { method: "POST", body: JSON.stringify(body) });
    }
  };

  // src/core/storage.js
  var STORAGE_KEY = "pvzhtbot_mod_settings_v1";
  function hasGM() {
    return typeof GM_getValue === "function" && typeof GM_setValue === "function";
  }
  function readAll() {
    if (hasGM()) {
      const raw = GM_getValue(STORAGE_KEY, null);
      return raw ? JSON.parse(raw) : {};
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function writeAll(data) {
    const raw = JSON.stringify(data);
    if (hasGM()) {
      GM_setValue(STORAGE_KEY, raw);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, raw);
    } catch {
    }
  }
  var SettingsStore = class {
    constructor() {
      this._data = readAll();
    }
    get(key, defaultValue) {
      return key in this._data ? this._data[key] : defaultValue;
    }
    set(key, value) {
      this._data[key] = value;
      writeAll(this._data);
    }
    getAll() {
      return { ...this._data };
    }
    isPluginEnabled(pluginId, defaultEnabled = false) {
      const plugins = this.get("plugins", {});
      return pluginId in plugins ? Boolean(plugins[pluginId]) : defaultEnabled;
    }
    setPluginEnabled(pluginId, enabled) {
      const plugins = this.get("plugins", {});
      plugins[pluginId] = Boolean(enabled);
      this.set("plugins", plugins);
    }
  };

  // src/core/plugin-manager.js
  var PluginManager = class {
    constructor({ settings, context }) {
      this.settings = settings;
      this.context = context;
      this._plugins = /* @__PURE__ */ new Map();
      this._teardowns = /* @__PURE__ */ new Map();
      this._active = /* @__PURE__ */ new Set();
    }
    register(plugin) {
      if (!plugin || !plugin.id) {
        throw new Error("Plugin must have a unique `id`");
      }
      if (this._plugins.has(plugin.id)) {
        throw new Error(`Plugin id "${plugin.id}" is already registered`);
      }
      this._plugins.set(plugin.id, plugin);
      return this;
    }
    list() {
      return [...this._plugins.values()].map((p) => ({
        id: p.id,
        name: p.name || p.id,
        description: p.description || "",
        enabled: this.isEnabled(p.id),
        active: this._active.has(p.id),
        required: Boolean(p.required)
      }));
    }
    isEnabled(pluginId) {
      const plugin = this._plugins.get(pluginId);
      if (plugin?.required) return true;
      const defaultEnabled = plugin ? Boolean(plugin.defaultEnabled) : false;
      return this.settings.isPluginEnabled(pluginId, defaultEnabled);
    }
    /** Runs init() for every plugin currently marked enabled. Call once at startup. */
    async startEnabledPlugins() {
      for (const plugin of this._plugins.values()) {
        if (this.isEnabled(plugin.id)) {
          await this._activate(plugin.id);
        }
      }
    }
    async setEnabled(pluginId, enabled) {
      const plugin = this._plugins.get(pluginId);
      if (!plugin) throw new Error(`Unknown plugin id "${pluginId}"`);
      if (plugin.required && !enabled) {
        throw new Error(`Plugin "${pluginId}" is required and cannot be disabled`);
      }
      this.settings.setPluginEnabled(pluginId, enabled);
      if (enabled && !this._active.has(pluginId)) {
        await this._activate(pluginId);
      } else if (!enabled && this._active.has(pluginId)) {
        this._deactivate(pluginId);
      }
    }
    async _activate(pluginId) {
      const plugin = this._plugins.get(pluginId);
      try {
        const teardown = await plugin.init(this.context);
        this._teardowns.set(pluginId, typeof teardown === "function" ? teardown : plugin.teardown);
        this._active.add(pluginId);
        this.context.log(`[plugin:${pluginId}] activated`);
      } catch (err) {
        this.context.log(`[plugin:${pluginId}] failed to activate: ${err.message}`, "error");
      }
    }
    _deactivate(pluginId) {
      const teardown = this._teardowns.get(pluginId);
      try {
        if (typeof teardown === "function") teardown();
      } catch (err) {
        this.context.log(`[plugin:${pluginId}] error during teardown: ${err.message}`, "error");
      }
      this._teardowns.delete(pluginId);
      this._active.delete(pluginId);
      this.context.log(`[plugin:${pluginId}] deactivated`);
    }
  };

  // src/ui/settings-panel.js
  var PANEL_ID = "pvzhtbot-mod-settings-panel";
  var BACKDROP_ID = "pvzhtbot-mod-settings-backdrop";
  var STYLES = `
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
    const style = document.createElement("style");
    style.id = `${PANEL_ID}-styles`;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }
  function renderPluginRow(pluginInfo, onToggle) {
    const row = document.createElement("div");
    row.className = "pvzhtbot-mod-plugin-row";
    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "pvzhtbot-mod-plugin-name";
    name.textContent = pluginInfo.name;
    const desc = document.createElement("div");
    desc.className = "pvzhtbot-mod-plugin-desc";
    desc.textContent = pluginInfo.description;
    info.appendChild(name);
    if (pluginInfo.description) info.appendChild(desc);
    row.appendChild(info);
    if (pluginInfo.required) {
      const badge = document.createElement("span");
      badge.className = "pvzhtbot-mod-required-badge";
      badge.textContent = "Required";
      row.appendChild(badge);
    } else {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = pluginInfo.enabled;
      checkbox.addEventListener("change", () => onToggle(pluginInfo.id, checkbox.checked));
      row.appendChild(checkbox);
    }
    return row;
  }
  function createSettingsPanel(pluginManager) {
    injectStylesOnce();
    let panel = document.getElementById(PANEL_ID);
    let backdrop = document.getElementById(BACKDROP_ID);
    if (panel && backdrop) {
      return getPanelController(panel, backdrop, pluginManager);
    }
    backdrop = document.createElement("div");
    backdrop.id = BACKDROP_ID;
    backdrop.style.display = "none";
    document.body.appendChild(backdrop);
    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.display = "none";
    document.body.appendChild(panel);
    return getPanelController(panel, backdrop, pluginManager);
  }
  function getPanelController(panel, backdrop, pluginManager) {
    let changedSinceOpen = false;
    function render() {
      panel.innerHTML = "";
      const header = document.createElement("div");
      header.className = "pvzhtbot-mod-header";
      const heading = document.createElement("h3");
      heading.textContent = "PvZHTBot Mod \u2014 Plugins";
      const closeBtn = document.createElement("button");
      closeBtn.className = "pvzhtbot-mod-close";
      closeBtn.textContent = "\u2715";
      closeBtn.addEventListener("click", close);
      header.appendChild(heading);
      header.appendChild(closeBtn);
      panel.appendChild(header);
      const plugins = pluginManager.list();
      if (plugins.length === 0) {
        const empty = document.createElement("div");
        empty.className = "pvzhtbot-mod-empty";
        empty.textContent = "No plugins registered yet.";
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
        const notice = document.createElement("div");
        notice.className = "pvzhtbot-mod-restart-notice";
        const text = document.createElement("span");
        text.textContent = "Some plugins fully apply only after a page refresh.";
        const refreshBtn = document.createElement("button");
        refreshBtn.className = "pvzhtbot-mod-restart-btn";
        refreshBtn.textContent = "Refresh now";
        refreshBtn.addEventListener("click", () => location.reload());
        notice.appendChild(text);
        notice.appendChild(refreshBtn);
        panel.appendChild(notice);
      }
    }
    function open() {
      changedSinceOpen = false;
      render();
      backdrop.style.display = "block";
      panel.style.display = "block";
    }
    function close() {
      backdrop.style.display = "none";
      panel.style.display = "none";
    }
    function toggle() {
      if (panel.style.display === "none") open();
      else close();
    }
    backdrop.addEventListener("click", close);
    return { open, close, toggle, isOpen: () => panel.style.display !== "none" };
  }

  // src/ui/dashboard-card.js
  var GRID_SELECTOR = ".user-dashboard-grid";
  var CARD_MARKER_ATTR = "data-pvzhtbot-mod-card";
  function buildCard(onOpenSettings) {
    const card = document.createElement("a");
    card.href = "#";
    card.className = "user-dashboard-card";
    card.setAttribute(CARD_MARKER_ATTR, "true");
    const label = document.createElement("span");
    label.className = "user-dashboard-card-label";
    label.textContent = "Mod Settings";
    const action = document.createElement("span");
    action.className = "user-dashboard-card-action";
    action.textContent = "Configure \u2192";
    card.appendChild(label);
    card.appendChild(action);
    card.addEventListener("click", (e) => {
      e.preventDefault();
      onOpenSettings();
    });
    return card;
  }
  function isDashboardHome() {
    return location.pathname === "/dashboard" || location.pathname === "/dashboard/";
  }
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

  // src/core/dev-reload.js
  var DEV_SERVER_ORIGIN = "http://127.0.0.1:8787";
  var POLL_INTERVAL_MS = 1500;
  function startDevReloadWatcher(log2) {
    let currentBuildId2 = null;
    let everConnected = false;
    async function poll() {
      let buildId;
      try {
        const res = await fetch(`${DEV_SERVER_ORIGIN}/build-id`, { cache: "no-store" });
        if (!res.ok) return;
        buildId = (await res.text()).trim();
      } catch {
        return;
      }
      if (!everConnected) {
        everConnected = true;
        log2(`dev-reload watcher connected (build ${buildId})`);
      }
      if (currentBuildId2 === null) {
        currentBuildId2 = buildId;
        return;
      }
      if (buildId !== currentBuildId2) {
        log2(`dev-reload: new build detected (${currentBuildId2} -> ${buildId}), reloading...`);
        location.reload();
      }
    }
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    poll();
    return () => clearInterval(intervalId);
  }

  // src/core/collection-watcher.js
  var WRITE_METHODS = /* @__PURE__ */ new Set(["POST", "PATCH", "PUT", "DELETE"]);
  var listeners = /* @__PURE__ */ new Set();
  var patched = false;
  function isUserCardsWrite(url, method) {
    if (!WRITE_METHODS.has(method)) return false;
    try {
      const u = new URL(url, location.href);
      return u.hostname === "api.pvzhtbot.com" && u.pathname.includes("/user-cards/");
    } catch {
      return false;
    }
  }
  function ensurePatched() {
    if (patched) return;
    patched = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input?.url;
      const method = (init?.method || typeof input === "object" && input?.method || "GET").toUpperCase();
      const response = await originalFetch(input, init);
      if (response.ok && isUserCardsWrite(url, method)) {
        for (const listener of listeners) {
          try {
            listener();
          } catch {
          }
        }
      }
      return response;
    };
  }
  function onCollectionChanged(callback) {
    ensurePatched();
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  // src/plugins/collection-completion/index.js
  var SUMMARY_SELECTOR = ".card-manager-summary";
  var CONTENT_SELECTOR = ".card-manager-content";
  var MARKER_ATTR = "data-pvzhtbot-collection-completion";
  var STYLE_ID = "pvzhtbot-collection-completion-styles";
  var STYLES2 = `
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
.pvzhtbot-cc-details summary::before { content: '\u25B6 '; }
.pvzhtbot-cc-details[open] summary::before { content: '\u25BC '; }
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
`;
  function injectStylesOnce2() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLES2;
    document.head.appendChild(style);
  }
  function isCardManagerPage() {
    return location.pathname === "/dashboard/card-manager" || location.pathname === "/dashboard/card-manager/";
  }
  function buildSummaryBox(percentText) {
    const box = document.createElement("div");
    box.className = "summary-item";
    box.setAttribute(MARKER_ATTR, "summary");
    const label = document.createElement("span");
    label.className = "summary-label";
    label.textContent = "Completion";
    const value = document.createElement("div");
    value.className = "pvzhtbot-cc-summary-value";
    value.style.fontWeight = "700";
    value.style.fontSize = "20px";
    value.style.marginTop = "2px";
    value.textContent = percentText;
    const subLine = document.createElement("div");
    subLine.className = "pvzhtbot-cc-summary-sub";
    box.appendChild(label);
    box.appendChild(value);
    box.appendChild(subLine);
    return box;
  }
  function pctFloorUnlessComplete(owned, total) {
    if (total === 0) return 0;
    if (owned >= total) return 100;
    return Math.min(99, Math.floor(owned / total * 100));
  }
  function formatCompletionValue(result) {
    const pct = pctFloorUnlessComplete(result.ownedNormal, result.totalNormal);
    return `${result.ownedNormal} / ${result.totalNormal} (${pct}%)`;
  }
  function formatPlaysetSubLine(result) {
    const pct = pctFloorUnlessComplete(result.fullPlaysetNormal, result.totalNormal);
    return `4x playsets: ${result.fullPlaysetNormal} / ${result.totalNormal} (${pct}%)`;
  }
  var CACHE_KEY = `pvzhtbot-mod-collection-completion-cache-${typeof __PVZHTBOT_MOD_BUILD_ID__ !== "undefined" ? __PVZHTBOT_MOD_BUILD_ID__ : "dev"}`;
  var CACHE_TTL_MS = 5 * 60 * 1e3;
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
    }
  }
  function clearStaleCacheEntries() {
    try {
      const prefix = "pvzhtbot-mod-collection-completion-cache-";
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith(prefix) && key !== CACHE_KEY) sessionStorage.removeItem(key);
      }
    } catch {
    }
  }
  function normalizeRarity(rawRarity) {
    if (!rawRarity) return "Unknown";
    const trimmed = rawRarity.trim();
    const firstHyphen = trimmed.indexOf("-");
    if (firstHyphen === -1) return trimmed;
    const set = trimmed.slice(0, firstHyphen).trim();
    const tier = trimmed.slice(firstHyphen + 1).trim();
    return `${set} - ${tier}`;
  }
  function splitSetAndTier(normalizedRarity) {
    const firstHyphen = normalizedRarity.indexOf(" - ");
    if (firstHyphen === -1) return { set: normalizedRarity, tier: "" };
    return {
      set: normalizedRarity.slice(0, firstHyphen),
      tier: normalizedRarity.slice(firstHyphen + 3)
    };
  }
  var SET_ORDER = ["Basic", "Premium", "Galactic", "Colossal", "Triassic", "Event"];
  var TIER_ORDER = ["Common", "Uncommon", "Rare", "Super-Rare", "Legendary"];
  function orderIndex(list, value) {
    const idx = list.indexOf(value);
    return idx === -1 ? list.length : idx;
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
    const myCardsRes = await api.getMyCards();
    const fingerprint = fingerprintCards(myCardsRes);
    if (!forceRefresh) {
      const cached = readCache(fingerprint);
      if (cached) return cached;
    }
    const FULL_PLAYSET = 4;
    const allCards = await api.getAllCardInfo();
    const owned = new Set(myCardsRes.cards.map((c) => c.card_name));
    const ownedQty = new Map(myCardsRes.cards.map((c) => [c.card_name, c.quantity]));
    const sides = ["Plants", "Zombie"];
    const missingBySideClass = [];
    const underPlaysetBySideClass = [];
    const byRarity = /* @__PURE__ */ new Map();
    let totalNormal = 0;
    let ownedNormal = 0;
    let fullPlaysetNormal = 0;
    function isNonCollectible(cardInfo) {
      return cardInfo.set_rarity === "Premium - Hero" || cardInfo.set_rarity === "Token" || (cardInfo.description || "").includes("Superpower");
    }
    for (const side of sides) {
      const { classes } = await api.getClasses(side);
      for (const cardClass of classes) {
        const available = await api.getAvailableCards(side, cardClass);
        const list = Array.isArray(available) ? available : available.cards || [];
        const notReturned = new Set(list.map((c) => c.card_name));
        const classCardInfos = allCards.filter(
          (c) => c.side === side && c.card_type === cardClass && !isNonCollectible(c)
        );
        for (const cardInfo of classCardInfos) {
          totalNormal += 1;
          const rarity = normalizeRarity(cardInfo.set_rarity);
          if (!byRarity.has(rarity)) byRarity.set(rarity, { total: 0, owned: 0, fullPlayset: 0 });
          const rarityStats = byRarity.get(rarity);
          rarityStats.total += 1;
          const returnedEntry = notReturned.has(cardInfo.card_name) ? list.find((c) => c.card_name === cardInfo.card_name) : null;
          const qty = returnedEntry ? returnedEntry.owned_quantity : ownedQty.get(cardInfo.card_name) || FULL_PLAYSET;
          if (qty > 0) {
            ownedNormal += 1;
            rarityStats.owned += 1;
          }
          if (qty >= FULL_PLAYSET) {
            fullPlaysetNormal += 1;
            rarityStats.fullPlayset += 1;
          } else if (qty > 0) {
            let group = underPlaysetBySideClass.find((g) => g.side === side && g.cardClass === cardClass);
            if (!group) {
              group = { side, cardClass, cards: [] };
              underPlaysetBySideClass.push(group);
            }
            group.cards.push({ name: cardInfo.card_name, quantity: qty });
          } else {
            let group = missingBySideClass.find((g) => g.side === side && g.cardClass === cardClass);
            if (!group) {
              group = { side, cardClass, cards: [] };
              missingBySideClass.push(group);
            }
            group.cards.push(cardInfo.card_name);
          }
        }
      }
    }
    const rarityBreakdown = [...byRarity.entries()].map(([rarity, stats]) => ({ rarity, ...stats })).sort(compareRaritiesBySetThenTier);
    const result = {
      totalNormal,
      ownedNormal,
      fullPlaysetNormal,
      missingBySideClass,
      underPlaysetBySideClass,
      rarityBreakdown,
      totalGameCards: allCards.length,
      ownedTotal: owned.size
    };
    writeCache(result, fingerprint);
    return result;
  }
  var GRID_SETS = SET_ORDER.filter((s) => s !== "Event");
  function cellColor(owned, total) {
    if (total === 0) return "#444";
    if (owned === total) return "#3f9e5e";
    if (owned === 0) return "#5a2a2a";
    return "#8a6a2a";
  }
  function buildRarityMatrix(rarityBreakdown) {
    const bySetTier = /* @__PURE__ */ new Map();
    let eventStats = null;
    for (const { rarity, owned, total } of rarityBreakdown) {
      const { set, tier } = splitSetAndTier(rarity);
      if (set === "Event") {
        eventStats = { owned, total };
      } else {
        bySetTier.set(`${set}|${tier}`, { owned, total });
      }
    }
    const wrapper = document.createElement("div");
    const table = document.createElement("table");
    table.className = "pvzhtbot-cc-matrix";
    const headerRow = document.createElement("tr");
    headerRow.appendChild(document.createElement("th"));
    for (const tier of TIER_ORDER) {
      const th = document.createElement("th");
      th.textContent = tier;
      headerRow.appendChild(th);
    }
    table.appendChild(headerRow);
    for (const set of GRID_SETS) {
      const row = document.createElement("tr");
      const setHeader = document.createElement("th");
      setHeader.className = "pvzhtbot-cc-matrix-row-label";
      setHeader.textContent = set;
      row.appendChild(setHeader);
      let setHasAnyData = false;
      for (const tier of TIER_ORDER) {
        const stats = bySetTier.get(`${set}|${tier}`);
        const cell = document.createElement("td");
        if (stats) {
          setHasAnyData = true;
          cell.className = "pvzhtbot-cc-matrix-cell";
          cell.style.background = cellColor(stats.owned, stats.total);
          cell.textContent = `${stats.owned}/${stats.total}`;
          cell.title = `${set} - ${tier}: ${stats.owned}/${stats.total} owned`;
        } else {
          cell.className = "pvzhtbot-cc-matrix-cell-empty";
          cell.textContent = "\u2014";
        }
        row.appendChild(cell);
      }
      if (setHasAnyData) table.appendChild(row);
    }
    if (eventStats) {
      const eventRow = document.createElement("tr");
      const rowLabel = document.createElement("th");
      rowLabel.className = "pvzhtbot-cc-matrix-row-label";
      rowLabel.textContent = "Event";
      eventRow.appendChild(rowLabel);
      const cell = document.createElement("td");
      cell.className = "pvzhtbot-cc-matrix-cell";
      cell.colSpan = TIER_ORDER.length;
      cell.style.background = cellColor(eventStats.owned, eventStats.total);
      cell.textContent = `${eventStats.owned}/${eventStats.total}`;
      cell.title = `Event: ${eventStats.owned}/${eventStats.total} owned`;
      eventRow.appendChild(cell);
      table.appendChild(eventRow);
    }
    wrapper.appendChild(table);
    return wrapper;
  }
  function buildDetailsPanel(result) {
    const details = document.createElement("details");
    details.className = "pvzhtbot-cc-details";
    details.setAttribute(MARKER_ATTR, "details");
    const summary = document.createElement("summary");
    const missingCount = result.totalNormal - result.ownedNormal;
    summary.textContent = missingCount === 0 ? "Completion breakdown (100% \u2014 full collection of normal cards!)" : `Completion breakdown (${missingCount} missing across ${result.missingBySideClass.length} side/class groups)`;
    details.appendChild(summary);
    if (result.rarityBreakdown?.length) {
      const rarityTitle = document.createElement("div");
      rarityTitle.className = "pvzhtbot-cc-group-title";
      rarityTitle.style.marginTop = "4px";
      rarityTitle.textContent = "By set / rarity";
      details.appendChild(rarityTitle);
      details.appendChild(buildRarityMatrix(result.rarityBreakdown));
    }
    if (missingCount > 0) {
      const missingTitle = document.createElement("div");
      missingTitle.className = "pvzhtbot-cc-group-title";
      missingTitle.style.marginTop = "14px";
      missingTitle.textContent = `Missing cards (${missingCount})`;
      details.appendChild(missingTitle);
      for (const group of result.missingBySideClass) {
        const groupEl = document.createElement("div");
        groupEl.className = "pvzhtbot-cc-group";
        const title = document.createElement("div");
        title.className = "pvzhtbot-cc-group-title";
        title.textContent = `${group.side} \u2014 ${group.cardClass} (${group.cards.length})`;
        groupEl.appendChild(title);
        const list = document.createElement("div");
        list.className = "pvzhtbot-cc-card-list";
        for (const name of group.cards) {
          const chip = document.createElement("span");
          chip.className = "pvzhtbot-cc-card-chip";
          chip.textContent = name;
          list.appendChild(chip);
        }
        groupEl.appendChild(list);
        details.appendChild(groupEl);
      }
    }
    const underPlaysetCount = result.underPlaysetBySideClass?.reduce((sum, g) => sum + g.cards.length, 0) || 0;
    if (underPlaysetCount > 0) {
      const underTitle = document.createElement("div");
      underTitle.className = "pvzhtbot-cc-group-title";
      underTitle.style.marginTop = "14px";
      underTitle.textContent = `Owned but under 4x playset (${underPlaysetCount})`;
      details.appendChild(underTitle);
      for (const group of result.underPlaysetBySideClass) {
        const groupEl = document.createElement("div");
        groupEl.className = "pvzhtbot-cc-group";
        const title = document.createElement("div");
        title.className = "pvzhtbot-cc-group-title";
        title.textContent = `${group.side} \u2014 ${group.cardClass} (${group.cards.length})`;
        groupEl.appendChild(title);
        const list = document.createElement("div");
        list.className = "pvzhtbot-cc-card-list";
        for (const { name, quantity } of group.cards) {
          const chip = document.createElement("span");
          chip.className = "pvzhtbot-cc-card-chip";
          chip.textContent = name;
          const qtySpan = document.createElement("span");
          qtySpan.className = "pvzhtbot-cc-underplayset-qty";
          qtySpan.textContent = ` ${quantity}/4`;
          chip.appendChild(qtySpan);
          list.appendChild(chip);
        }
        groupEl.appendChild(list);
        details.appendChild(groupEl);
      }
    }
    const note = document.createElement("div");
    note.style.marginTop = "10px";
    note.style.fontSize = "11px";
    note.style.color = "#777";
    note.textContent = "Hero and Superpower cards are excluded \u2014 the site's own Add Cards flow doesn't offer them either.";
    details.appendChild(note);
    return details;
  }
  var collectionCompletionPlugin = {
    id: "collection-completion",
    name: "Collection Completion Tracker",
    description: "Shows % of normal cards owned and lists what's missing, on the Card Manager page. Updates live when you add/remove/edit cards, no refresh needed.",
    defaultEnabled: true,
    async init(context) {
      injectStylesOnce2();
      clearStaleCacheEntries();
      let disposed = false;
      let injectedSummary = null;
      let injectedDetails = null;
      async function recompute({ forceRefresh = false } = {}) {
        if (disposed || !injectedSummary) return;
        const valueEl = injectedSummary.querySelector(".pvzhtbot-cc-summary-value");
        const subEl = injectedSummary.querySelector(".pvzhtbot-cc-summary-sub");
        valueEl.textContent = "\u2026";
        valueEl.className = "pvzhtbot-cc-summary-value";
        subEl.textContent = "";
        try {
          const result = await computeCompletion(context.api, { forceRefresh });
          if (disposed) return;
          valueEl.textContent = formatCompletionValue(result);
          subEl.textContent = formatPlaysetSubLine(result);
          const newDetailsPanel = buildDetailsPanel(result);
          if (injectedDetails) {
            injectedDetails.replaceWith(newDetailsPanel);
          } else {
            injectedSummary.parentElement.insertAdjacentElement("afterend", newDetailsPanel);
          }
          injectedDetails = newDetailsPanel;
        } catch (err) {
          valueEl.textContent = "error";
          valueEl.className = "pvzhtbot-cc-error";
          context.log(`[collection-completion] failed to compute: ${err.message}`, "error");
        }
      }
      function tryInject() {
        if (disposed || !isCardManagerPage()) return;
        const summarySection = document.querySelector(SUMMARY_SELECTOR);
        const content = document.querySelector(CONTENT_SELECTOR);
        if (!summarySection || !content) return;
        if (summarySection.querySelector(`[${MARKER_ATTR}="summary"]`)) return;
        injectedSummary = buildSummaryBox("\u2026");
        summarySection.appendChild(injectedSummary);
        injectedDetails = null;
        recompute();
      }
      tryInject();
      const observer = new MutationObserver(() => tryInject());
      observer.observe(document.body, { childList: true, subtree: true });
      const unsubscribe = onCollectionChanged(() => recompute({ forceRefresh: true }));
      return () => {
        disposed = true;
        observer.disconnect();
        unsubscribe();
        injectedSummary?.remove();
        injectedDetails?.remove();
      };
    }
  };

  // src/plugins/deck-buildability/index.js
  var MARKER_ATTR2 = "data-pvzhtbot-deck-buildability-card";
  var STYLE_ID2 = "pvzhtbot-deck-buildability-styles";
  var PANEL_ID2 = "pvzhtbot-deck-buildability-panel";
  var BACKDROP_ID2 = "pvzhtbot-deck-buildability-backdrop";
  var GRID_SELECTOR2 = ".user-dashboard-grid";
  var STYLES3 = `
#${BACKDROP_ID2} {
  position: fixed;
  inset: 0;
  z-index: 999997;
  background: rgba(0,0,0,0.5);
}
#${PANEL_ID2} {
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
#${PANEL_ID2} .pvzhtbot-db-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
#${PANEL_ID2} h3 { margin: 0; font-size: 16px; }
#${PANEL_ID2} .pvzhtbot-db-close {
  background: none; border: none; color: #999; font-size: 18px; cursor: pointer; line-height: 1;
}
#${PANEL_ID2} .pvzhtbot-db-close:hover { color: #eee; }
#${PANEL_ID2} .pvzhtbot-db-subtitle { color: #999; font-size: 12px; margin-bottom: 12px; }
#${PANEL_ID2} .pvzhtbot-db-filters { display: flex; gap: 8px; margin-bottom: 12px; }
#${PANEL_ID2} .pvzhtbot-db-filters button {
  background: #1f2125; border: 1px solid #333; color: #ccc; border-radius: 4px;
  padding: 4px 10px; font-size: 12px; cursor: pointer;
}
#${PANEL_ID2} .pvzhtbot-db-filters button.active { background: #1f6f3f; color: #fff; border-color: #1f6f3f; }
#${PANEL_ID2} .pvzhtbot-db-search {
  width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 8px 10px;
  background: #1f2125; border: 1px solid #333; border-radius: 6px; color: #eee; font: 13px system-ui, sans-serif;
}
#${PANEL_ID2} .pvzhtbot-db-search:focus { outline: none; border-color: #1f6f3f; }
#${PANEL_ID2} .pvzhtbot-db-search::placeholder { color: #777; }
#${PANEL_ID2} .pvzhtbot-db-deck {
  border: 1px solid #262626; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px;
  cursor: pointer;
}
#${PANEL_ID2} .pvzhtbot-db-deck:hover { border-color: #3a3a3a; }
#${PANEL_ID2} .pvzhtbot-db-deck-row { display: flex; gap: 12px; align-items: flex-start; }
#${PANEL_ID2} .pvzhtbot-db-deck-thumb { width: 48px; height: 48px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
#${PANEL_ID2} .pvzhtbot-db-deck-main { flex: 1; min-width: 0; }
#${PANEL_ID2} .pvzhtbot-db-deck-name { font-weight: 600; }
#${PANEL_ID2} .pvzhtbot-db-deck-name::before { content: '\u25B6 '; display: inline-block; font-size: 10px; color: #777; }
#${PANEL_ID2} .pvzhtbot-db-deck.expanded .pvzhtbot-db-deck-name::before { content: '\u25BC '; }
#${PANEL_ID2} .pvzhtbot-db-deck-meta { color: #999; font-size: 11px; margin-top: 1px; }
#${PANEL_ID2} .pvzhtbot-db-deck-pct { font-weight: 700; white-space: nowrap; }
#${PANEL_ID2} .pvzhtbot-db-deck-pct.full { color: #6fd88a; }
#${PANEL_ID2} .pvzhtbot-db-deck-pct.partial { color: #e0c96a; }
#${PANEL_ID2} .pvzhtbot-db-missing { margin-top: 6px; font-size: 11px; color: #d99; }
#${PANEL_ID2} .pvzhtbot-db-description {
  margin-top: 10px; padding-top: 10px; border-top: 1px solid #262626;
  font-size: 12px; color: #bbb; line-height: 1.5; white-space: pre-wrap;
}
#${PANEL_ID2} .pvzhtbot-db-cardlist {
  margin-top: 10px; padding-top: 10px; border-top: 1px solid #262626;
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px;
}
#${PANEL_ID2} .pvzhtbot-db-cardlist-item { display: flex; justify-content: space-between; font-size: 12px; }
#${PANEL_ID2} .pvzhtbot-db-cardlist-item.owned { color: #ccc; }
#${PANEL_ID2} .pvzhtbot-db-cardlist-item.missing { color: #e0a0a0; }
#${PANEL_ID2} .pvzhtbot-db-cardlist-qty { color: #777; margin-left: 8px; white-space: nowrap; }
#${PANEL_ID2} .pvzhtbot-db-empty, #${PANEL_ID2} .pvzhtbot-db-loading { color: #999; font-style: italic; }
#${PANEL_ID2} .pvzhtbot-db-error { color: #e08080; }
#${PANEL_ID2} .pvzhtbot-db-more-btn {
  display: block; width: 100%; margin-top: 4px; padding: 8px;
  background: #1f2125; border: 1px solid #333; color: #ccc; border-radius: 6px;
  cursor: pointer; font-size: 12px;
}
#${PANEL_ID2} .pvzhtbot-db-more-btn:hover { background: #262a2e; border-color: #444; }
`;
  function injectStylesOnce3() {
    if (document.getElementById(STYLE_ID2)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID2;
    style.textContent = STYLES3;
    document.head.appendChild(style);
  }
  function isDashboardHome2() {
    return location.pathname === "/dashboard" || location.pathname === "/dashboard/";
  }
  function parseDeckCards(cardsField) {
    return cardsField.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [name, qtyStr] = line.split("|");
      return { name: name.trim(), quantity: parseInt(qtyStr, 10) || 0 };
    });
  }
  async function computeBuildability(api) {
    const [decklists, myCardsRes] = await Promise.all([api.getAllDecklists(), api.getMyCards()]);
    const ownedQty = new Map(myCardsRes.cards.map((c) => [c.card_name, c.quantity]));
    return decklists.map((deck) => {
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
      const pct = totalNeeded === 0 ? 0 : Math.round(totalOwned / totalNeeded * 100);
      return { deck, pct, missing, cardStatus, canBuild: missing.length === 0 };
    }).sort((a, b) => b.pct - a.pct);
  }
  function buildCardListSection(entry) {
    const section = document.createElement("div");
    section.className = "pvzhtbot-db-cardlist";
    for (const card of entry.cardStatus) {
      const item = document.createElement("div");
      item.className = `pvzhtbot-db-cardlist-item ${card.missing ? "missing" : "owned"}`;
      const nameEl = document.createElement("span");
      nameEl.textContent = card.name;
      const qtyEl = document.createElement("span");
      qtyEl.className = "pvzhtbot-db-cardlist-qty";
      qtyEl.textContent = card.missing ? `${card.owned}/${card.quantity}` : `${card.quantity}x`;
      item.appendChild(nameEl);
      item.appendChild(qtyEl);
      section.appendChild(item);
    }
    return section;
  }
  function buildDeckRow(entry) {
    const row = document.createElement("div");
    row.className = "pvzhtbot-db-deck";
    const clickRow = document.createElement("div");
    clickRow.className = "pvzhtbot-db-deck-row";
    if (entry.deck.image) {
      const thumb = document.createElement("img");
      thumb.className = "pvzhtbot-db-deck-thumb";
      thumb.src = entry.deck.image;
      thumb.alt = "";
      thumb.loading = "lazy";
      clickRow.appendChild(thumb);
    }
    const main = document.createElement("div");
    main.className = "pvzhtbot-db-deck-main";
    const nameRow = document.createElement("div");
    nameRow.style.display = "flex";
    nameRow.style.justifyContent = "space-between";
    nameRow.style.gap = "8px";
    const name = document.createElement("div");
    name.className = "pvzhtbot-db-deck-name";
    name.textContent = entry.deck.name;
    const pct = document.createElement("div");
    pct.className = `pvzhtbot-db-deck-pct ${entry.canBuild ? "full" : "partial"}`;
    pct.textContent = entry.canBuild ? "Can build" : `${entry.pct}%`;
    nameRow.appendChild(name);
    nameRow.appendChild(pct);
    main.appendChild(nameRow);
    const meta = document.createElement("div");
    meta.className = "pvzhtbot-db-deck-meta";
    meta.textContent = `${entry.deck.hero} \u2014 ${entry.deck.archetype || entry.deck.category || ""} \u2014 by ${entry.deck.creator}`;
    main.appendChild(meta);
    if (!entry.canBuild) {
      const missing = document.createElement("div");
      missing.className = "pvzhtbot-db-missing";
      missing.textContent = `Missing: ${entry.missing.slice(0, 6).map((m) => `${m.name} (${m.have}/${m.need})`).join(", ")}${entry.missing.length > 6 ? `, +${entry.missing.length - 6} more` : ""}`;
      main.appendChild(missing);
    }
    clickRow.appendChild(main);
    row.appendChild(clickRow);
    let descriptionEl = null;
    let cardListEl = null;
    row.addEventListener("click", () => {
      const expanded = row.classList.toggle("expanded");
      if (expanded) {
        if (!descriptionEl && entry.deck.description) {
          descriptionEl = document.createElement("div");
          descriptionEl.className = "pvzhtbot-db-description";
          descriptionEl.textContent = entry.deck.description;
          row.appendChild(descriptionEl);
        }
        if (!cardListEl) {
          cardListEl = buildCardListSection(entry);
          row.appendChild(cardListEl);
        }
        if (descriptionEl) descriptionEl.style.display = "block";
        cardListEl.style.display = "grid";
        row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        if (descriptionEl) descriptionEl.style.display = "none";
        if (cardListEl) cardListEl.style.display = "none";
      }
    });
    return row;
  }
  function createPanel(api) {
    injectStylesOnce3();
    const backdrop = document.createElement("div");
    backdrop.id = BACKDROP_ID2;
    const panel = document.createElement("div");
    panel.id = PANEL_ID2;
    const PAGE_SIZE = 50;
    let allResults = null;
    let filter = "all";
    let visibleCount = PAGE_SIZE;
    let searchQuery = "";
    function close() {
      backdrop.remove();
      panel.remove();
    }
    function matchesSearch2(entry, query) {
      if (!query) return true;
      const haystack = [
        entry.deck.name,
        entry.deck.hero,
        entry.deck.archetype,
        entry.deck.category,
        entry.deck.creator,
        entry.deck.aliases,
        ...entry.cardStatus.map((c) => c.name)
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    }
    function currentFiltered() {
      let results = allResults;
      if (filter === "buildable") results = results.filter((r) => r.canBuild);
      if (filter === "close") results = results.filter((r) => !r.canBuild && r.pct >= 70);
      const query = searchQuery.trim().toLowerCase();
      if (query) results = results.filter((r) => matchesSearch2(r, query));
      return results;
    }
    function renderList() {
      const list = panel.querySelector(".pvzhtbot-db-list");
      list.innerHTML = "";
      const filtered = currentFiltered();
      if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "pvzhtbot-db-empty";
        empty.textContent = "No decks match this filter.";
        list.appendChild(empty);
        return;
      }
      for (const entry of filtered.slice(0, visibleCount)) {
        list.appendChild(buildDeckRow(entry));
      }
      if (filtered.length > visibleCount) {
        const remaining = filtered.length - visibleCount;
        const moreBtn = document.createElement("button");
        moreBtn.className = "pvzhtbot-db-more-btn";
        moreBtn.textContent = `Show ${Math.min(PAGE_SIZE, remaining)} more (${remaining} remaining)`;
        moreBtn.addEventListener("click", () => {
          visibleCount += PAGE_SIZE;
          renderList();
        });
        list.appendChild(moreBtn);
      }
    }
    function renderFilters() {
      const filtersEl = panel.querySelector(".pvzhtbot-db-filters");
      filtersEl.innerHTML = "";
      const buildable = allResults.filter((r) => r.canBuild).length;
      const close2 = allResults.filter((r) => !r.canBuild && r.pct >= 70).length;
      const options = [
        ["all", `All (${allResults.length})`],
        ["buildable", `Can build (${buildable})`],
        ["close", `Close (70%+) (${close2})`]
      ];
      for (const [key, label] of options) {
        const btn = document.createElement("button");
        btn.textContent = label;
        if (key === filter) btn.classList.add("active");
        btn.addEventListener("click", () => {
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
      searchQuery = "";
      document.body.appendChild(backdrop);
      document.body.appendChild(panel);
      backdrop.addEventListener("click", close);
      panel.innerHTML = "";
      const header = document.createElement("div");
      header.className = "pvzhtbot-db-header";
      const heading = document.createElement("h3");
      heading.textContent = "Deck Buildability";
      const closeBtn = document.createElement("button");
      closeBtn.className = "pvzhtbot-db-close";
      closeBtn.textContent = "\u2715";
      closeBtn.addEventListener("click", close);
      header.appendChild(heading);
      header.appendChild(closeBtn);
      panel.appendChild(header);
      const subtitle = document.createElement("div");
      subtitle.className = "pvzhtbot-db-subtitle";
      subtitle.textContent = "Community decks ranked by % of cards you own. Read-only \u2014 nothing here is added to your collection.";
      panel.appendChild(subtitle);
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.className = "pvzhtbot-db-search";
      searchInput.placeholder = "Search decks by name, hero, archetype, creator, or card...";
      searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value;
        visibleCount = PAGE_SIZE;
        renderList();
      });
      panel.appendChild(searchInput);
      const filtersEl = document.createElement("div");
      filtersEl.className = "pvzhtbot-db-filters";
      panel.appendChild(filtersEl);
      const list = document.createElement("div");
      list.className = "pvzhtbot-db-list";
      const loading = document.createElement("div");
      loading.className = "pvzhtbot-db-loading";
      loading.textContent = "Loading decks and your collection...";
      list.appendChild(loading);
      panel.appendChild(list);
      try {
        allResults = await computeBuildability(api);
        renderFilters();
        renderList();
      } catch (err) {
        list.innerHTML = "";
        const errEl = document.createElement("div");
        errEl.className = "pvzhtbot-db-error";
        errEl.textContent = `Failed to load: ${err.message}`;
        list.appendChild(errEl);
      }
    }
    return { open };
  }
  var deckBuildabilityPlugin = {
    id: "deck-buildability",
    name: "Deck Buildability Helper",
    description: "Ranks community decks by how many of their cards you own, with a click-through panel from /dashboard.",
    defaultEnabled: true,
    async init(context) {
      const panelController = createPanel(context.api);
      function buildCard2() {
        const card = document.createElement("a");
        card.href = "#";
        card.className = "user-dashboard-card";
        card.setAttribute(MARKER_ATTR2, "true");
        const label = document.createElement("span");
        label.className = "user-dashboard-card-label";
        label.textContent = "Deck Buildability";
        const action = document.createElement("span");
        action.className = "user-dashboard-card-action";
        action.textContent = "View \u2192";
        card.appendChild(label);
        card.appendChild(action);
        card.addEventListener("click", (e) => {
          e.preventDefault();
          panelController.open();
        });
        return card;
      }
      function tryInject() {
        if (!isDashboardHome2()) return;
        const grid = document.querySelector(GRID_SELECTOR2);
        if (!grid) return;
        if (grid.querySelector(`[${MARKER_ATTR2}]`)) return;
        grid.appendChild(buildCard2());
      }
      tryInject();
      const observer = new MutationObserver(() => tryInject());
      observer.observe(document.body, { childList: true, subtree: true });
      return () => {
        observer.disconnect();
        document.querySelector(`[${MARKER_ATTR2}]`)?.remove();
      };
    }
  };

  // src/plugins/hero-reference/index.js
  var MARKER_ATTR3 = "data-pvzhtbot-hero-reference-card";
  var STYLE_ID3 = "pvzhtbot-hero-reference-styles";
  var PANEL_ID3 = "pvzhtbot-hero-reference-panel";
  var BACKDROP_ID3 = "pvzhtbot-hero-reference-backdrop";
  var GRID_SELECTOR3 = ".user-dashboard-grid";
  var STYLES4 = `
#${BACKDROP_ID3} {
  position: fixed; inset: 0; z-index: 999996; background: rgba(0,0,0,0.5);
}
#${PANEL_ID3} {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  z-index: 999996; width: min(680px, 92vw); max-height: 80vh; overflow-y: auto;
  background: #14161a; color: #eee; border: 1px solid #333; border-radius: 8px;
  padding: 16px 20px; font: 13px system-ui, sans-serif; box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
#${PANEL_ID3} .pvzhtbot-hr-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
#${PANEL_ID3} h3 { margin: 0; font-size: 16px; }
#${PANEL_ID3} .pvzhtbot-hr-close { background: none; border: none; color: #999; font-size: 18px; cursor: pointer; line-height: 1; }
#${PANEL_ID3} .pvzhtbot-hr-close:hover { color: #eee; }
#${PANEL_ID3} .pvzhtbot-hr-subtitle { color: #999; font-size: 12px; margin-bottom: 12px; }
#${PANEL_ID3} .pvzhtbot-hr-search {
  width: 100%; box-sizing: border-box; margin-bottom: 12px; padding: 8px 10px;
  background: #1f2125; border: 1px solid #333; border-radius: 6px; color: #eee; font: 13px system-ui, sans-serif;
}
#${PANEL_ID3} .pvzhtbot-hr-search:focus { outline: none; border-color: #1f6f3f; }
#${PANEL_ID3} .pvzhtbot-hr-hero { border: 1px solid #262626; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; }
#${PANEL_ID3} .pvzhtbot-hr-hero-row { display: flex; gap: 12px; align-items: center; cursor: pointer; }
#${PANEL_ID3} .pvzhtbot-hr-hero-thumb { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
#${PANEL_ID3} .pvzhtbot-hr-hero-name { font-weight: 600; }
#${PANEL_ID3} .pvzhtbot-hr-hero-name::before { content: '\u25B6 '; font-size: 10px; color: #777; }
#${PANEL_ID3} .pvzhtbot-hr-hero.expanded .pvzhtbot-hr-hero-name::before { content: '\u25BC '; }
#${PANEL_ID3} .pvzhtbot-hr-hero-meta { color: #999; font-size: 11px; }
#${PANEL_ID3} .pvzhtbot-hr-powers { margin-top: 10px; padding-top: 10px; border-top: 1px solid #262626; }
#${PANEL_ID3} .pvzhtbot-hr-power { margin-bottom: 8px; }
#${PANEL_ID3} .pvzhtbot-hr-power-title { font-weight: 600; color: #9be29b; font-size: 12px; }
#${PANEL_ID3} .pvzhtbot-hr-power-text { font-size: 12px; color: #ccc; margin-top: 2px; white-space: pre-wrap; }
#${PANEL_ID3} .pvzhtbot-hr-empty, #${PANEL_ID3} .pvzhtbot-hr-loading { color: #999; font-style: italic; }
#${PANEL_ID3} .pvzhtbot-hr-error { color: #e08080; }
`;
  function injectStylesOnce4() {
    if (document.getElementById(STYLE_ID3)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID3;
    style.textContent = STYLES4;
    document.head.appendChild(style);
  }
  function isDashboardHome3() {
    return location.pathname === "/dashboard" || location.pathname === "/dashboard/";
  }
  var CLASS_TAG_PATTERN = /<:(\w+):\d+>/g;
  function stripEmojiTags(text) {
    return text.replace(CLASS_TAG_PATTERN, "$1");
  }
  function parseSuperpowers(abilityText) {
    if (!abilityText) return [];
    const blocks = abilityText.split("\r\n\r\n").map((b) => b.trim()).filter(Boolean);
    return blocks.map((block) => {
      const lines = block.split("\r\n");
      const [firstLine, ...rest] = lines;
      const hasClassTag = CLASS_TAG_PATTERN.test(firstLine);
      CLASS_TAG_PATTERN.lastIndex = 0;
      const title = stripEmojiTags(firstLine).trim();
      return {
        title: title || "(untitled)",
        text: stripEmojiTags(rest.join("\n")).trim(),
        isLikelySuperpower: hasClassTag
      };
    });
  }
  async function loadHeroes(api) {
    const { results } = await api.getAllHeroInfo();
    return results.map((hero) => ({
      ...hero,
      superpowers: parseSuperpowers(hero.ability)
    }));
  }
  function matchesSearch(hero, query) {
    if (!query) return true;
    const haystack = [
      hero.card_name,
      hero.card_type,
      hero.side,
      ...hero.superpowers.flatMap((p) => [p.title, p.text])
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  }
  function buildHeroRow(hero) {
    const wrapper = document.createElement("div");
    wrapper.className = "pvzhtbot-hr-hero";
    const clickRow = document.createElement("div");
    clickRow.className = "pvzhtbot-hr-hero-row";
    if (hero.thumbnail) {
      const thumb = document.createElement("img");
      thumb.className = "pvzhtbot-hr-hero-thumb";
      thumb.src = hero.thumbnail;
      thumb.alt = "";
      thumb.loading = "lazy";
      clickRow.appendChild(thumb);
    }
    const main = document.createElement("div");
    const name = document.createElement("div");
    name.className = "pvzhtbot-hr-hero-name";
    name.textContent = hero.card_name;
    const meta = document.createElement("div");
    meta.className = "pvzhtbot-hr-hero-meta";
    meta.textContent = `${hero.side} \u2014 ${hero.card_type}`;
    main.appendChild(name);
    main.appendChild(meta);
    clickRow.appendChild(main);
    wrapper.appendChild(clickRow);
    let powersEl = null;
    wrapper.addEventListener("click", () => {
      const expanded = wrapper.classList.toggle("expanded");
      if (expanded) {
        if (!powersEl) {
          powersEl = document.createElement("div");
          powersEl.className = "pvzhtbot-hr-powers";
          for (const power of hero.superpowers) {
            const powerEl = document.createElement("div");
            powerEl.className = "pvzhtbot-hr-power";
            const titleEl = document.createElement("div");
            titleEl.className = "pvzhtbot-hr-power-title";
            titleEl.textContent = power.isLikelySuperpower ? power.title : `${power.title} (token/reminder)`;
            const textEl = document.createElement("div");
            textEl.className = "pvzhtbot-hr-power-text";
            textEl.textContent = power.text;
            powerEl.appendChild(titleEl);
            powerEl.appendChild(textEl);
            powersEl.appendChild(powerEl);
          }
          wrapper.appendChild(powersEl);
        }
        powersEl.style.display = "block";
      } else if (powersEl) {
        powersEl.style.display = "none";
      }
    });
    return wrapper;
  }
  function createPanel2(api) {
    injectStylesOnce4();
    const backdrop = document.createElement("div");
    backdrop.id = BACKDROP_ID3;
    const panel = document.createElement("div");
    panel.id = PANEL_ID3;
    let allHeroes = null;
    let searchQuery = "";
    function close() {
      backdrop.remove();
      panel.remove();
    }
    function renderList() {
      const list = panel.querySelector(".pvzhtbot-hr-list");
      list.innerHTML = "";
      const query = searchQuery.trim().toLowerCase();
      const filtered = allHeroes.filter((h) => matchesSearch(h, query));
      if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "pvzhtbot-hr-empty";
        empty.textContent = "No heroes match this search.";
        list.appendChild(empty);
        return;
      }
      for (const hero of filtered) {
        list.appendChild(buildHeroRow(hero));
      }
    }
    async function open() {
      searchQuery = "";
      document.body.appendChild(backdrop);
      document.body.appendChild(panel);
      backdrop.addEventListener("click", close);
      panel.innerHTML = "";
      const header = document.createElement("div");
      header.className = "pvzhtbot-hr-header";
      const heading = document.createElement("h3");
      heading.textContent = "Hero Reference";
      const closeBtn = document.createElement("button");
      closeBtn.className = "pvzhtbot-hr-close";
      closeBtn.textContent = "\u2715";
      closeBtn.addEventListener("click", close);
      header.appendChild(heading);
      header.appendChild(closeBtn);
      panel.appendChild(header);
      const subtitle = document.createElement("div");
      subtitle.className = "pvzhtbot-hr-subtitle";
      subtitle.textContent = "Search heroes and superpowers. Click a hero to see its full superpower text.";
      panel.appendChild(subtitle);
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.className = "pvzhtbot-hr-search";
      searchInput.placeholder = "Search heroes, superpowers, or effect text...";
      searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value;
        renderList();
      });
      panel.appendChild(searchInput);
      const list = document.createElement("div");
      list.className = "pvzhtbot-hr-list";
      const loading = document.createElement("div");
      loading.className = "pvzhtbot-hr-loading";
      loading.textContent = "Loading heroes...";
      list.appendChild(loading);
      panel.appendChild(list);
      try {
        if (!allHeroes) allHeroes = await loadHeroes(api);
        renderList();
      } catch (err) {
        list.innerHTML = "";
        const errEl = document.createElement("div");
        errEl.className = "pvzhtbot-hr-error";
        errEl.textContent = `Failed to load: ${err.message}`;
        list.appendChild(errEl);
      }
    }
    return { open };
  }
  var heroReferencePlugin = {
    id: "hero-reference",
    name: "Hero Reference",
    description: "Searchable hero + superpower lookup from /dashboard, no need to visit the Hero Info page.",
    defaultEnabled: true,
    async init(context) {
      const panelController = createPanel2(context.api);
      function buildCard2() {
        const card = document.createElement("a");
        card.href = "#";
        card.className = "user-dashboard-card";
        card.setAttribute(MARKER_ATTR3, "true");
        const label = document.createElement("span");
        label.className = "user-dashboard-card-label";
        label.textContent = "Hero Reference";
        const action = document.createElement("span");
        action.className = "user-dashboard-card-action";
        action.textContent = "Search \u2192";
        card.appendChild(label);
        card.appendChild(action);
        card.addEventListener("click", (e) => {
          e.preventDefault();
          panelController.open();
        });
        return card;
      }
      function tryInject() {
        if (!isDashboardHome3()) return;
        const grid = document.querySelector(GRID_SELECTOR3);
        if (!grid) return;
        if (grid.querySelector(`[${MARKER_ATTR3}]`)) return;
        grid.appendChild(buildCard2());
      }
      tryInject();
      const observer = new MutationObserver(() => tryInject());
      observer.observe(document.body, { childList: true, subtree: true });
      return () => {
        observer.disconnect();
        document.querySelector(`[${MARKER_ATTR3}]`)?.remove();
      };
    }
  };

  // src/plugins/update-checker/index.js
  var BUILD_ID_URL = "https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist/build-id.txt";
  var INSTALL_URL = "https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist/pvzhtbot-mod.user.js";
  var CHECK_INTERVAL_MS = 60 * 60 * 1e3;
  var DISMISSED_KEY_PREFIX = "pvzhtbot-mod-update-dismissed-";
  var BANNER_ID = "pvzhtbot-update-banner";
  var STYLE_ID4 = "pvzhtbot-update-banner-styles";
  var STYLES5 = `
#${BANNER_ID} {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 999997;
  max-width: 320px;
  background: #14161a;
  border: 1px solid #2f5a3a;
  border-radius: 8px;
  padding: 12px 14px;
  color: #eee;
  font: 13px system-ui, sans-serif;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}
#${BANNER_ID} .pvzhtbot-update-title { font-weight: 600; color: #9be29b; margin-bottom: 4px; }
#${BANNER_ID} .pvzhtbot-update-body { color: #ccc; font-size: 12px; margin-bottom: 10px; }
#${BANNER_ID} .pvzhtbot-update-actions { display: flex; gap: 8px; justify-content: flex-end; }
#${BANNER_ID} button {
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
}
#${BANNER_ID} .pvzhtbot-update-view { background: #1f6f3f; color: #fff; }
#${BANNER_ID} .pvzhtbot-update-dismiss { background: #262626; color: #ccc; }
`;
  function injectStylesOnce5() {
    if (document.getElementById(STYLE_ID4)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID4;
    style.textContent = STYLES5;
    document.head.appendChild(style);
  }
  function currentBuildId() {
    return typeof __PVZHTBOT_MOD_BUILD_ID__ !== "undefined" ? __PVZHTBOT_MOD_BUILD_ID__ : null;
  }
  async function fetchLatestBuildId() {
    const res = await fetch(`${BUILD_ID_URL}?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`build-id.txt fetch failed with ${res.status}`);
    return (await res.text()).trim();
  }
  function showBanner(latestBuildId, log2) {
    if (document.getElementById(BANNER_ID)) return;
    injectStylesOnce5();
    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    const title = document.createElement("div");
    title.className = "pvzhtbot-update-title";
    title.textContent = "PvZHTBot Mod update available";
    banner.appendChild(title);
    const body = document.createElement("div");
    body.className = "pvzhtbot-update-body";
    body.textContent = "A newer build is published on GitHub than the one currently running.";
    banner.appendChild(body);
    const actions = document.createElement("div");
    actions.className = "pvzhtbot-update-actions";
    const dismissBtn = document.createElement("button");
    dismissBtn.className = "pvzhtbot-update-dismiss";
    dismissBtn.textContent = "Dismiss";
    dismissBtn.addEventListener("click", () => {
      try {
        sessionStorage.setItem(`${DISMISSED_KEY_PREFIX}${latestBuildId}`, "1");
      } catch {
      }
      banner.remove();
    });
    const viewBtn = document.createElement("button");
    viewBtn.className = "pvzhtbot-update-view";
    viewBtn.textContent = "View on GitHub";
    viewBtn.addEventListener("click", () => {
      window.open(INSTALL_URL, "_blank", "noopener,noreferrer");
    });
    actions.appendChild(dismissBtn);
    actions.appendChild(viewBtn);
    banner.appendChild(actions);
    document.body.appendChild(banner);
    log2("[update-checker] showing update banner");
  }
  function wasDismissed(buildId) {
    try {
      return sessionStorage.getItem(`${DISMISSED_KEY_PREFIX}${buildId}`) === "1";
    } catch {
      return false;
    }
  }
  async function checkOnce(log2) {
    const running = currentBuildId();
    if (!running) return;
    try {
      const latest = await fetchLatestBuildId();
      if (latest && latest !== running && !wasDismissed(latest)) {
        showBanner(latest, log2);
      }
    } catch (err) {
      log2(`[update-checker] check failed: ${err.message}`, "error");
    }
  }
  var updateCheckerPlugin = {
    id: "update-checker",
    name: "Update Checker",
    description: "Checks GitHub for a newer build and shows a dashboard notice if this install is out of date. Always on.",
    defaultEnabled: true,
    required: true,
    async init(context) {
      checkOnce(context.log);
      const intervalId = setInterval(() => checkOnce(context.log), CHECK_INTERVAL_MS);
      return () => {
        clearInterval(intervalId);
        document.getElementById(BANNER_ID)?.remove();
      };
    }
  };

  // src/userplugins/manifest.js
  var userPlugins = [];

  // src/core/loader.js
  var LOG_PREFIX = "[pvzhtbot-mod]";
  function log(message, level = "info") {
    const fn = level === "error" ? console.error : console.log;
    fn(`${LOG_PREFIX} ${message}`);
  }
  async function boot() {
    const settings = new SettingsStore();
    const api = new PvzhtbotApi();
    const backend = new BackendClient({ baseUrl: settings.get("backendUrl", null) });
    const context = { api, backend, settings, log };
    const pluginManager = new PluginManager({ settings, context });
    pluginManager.register(updateCheckerPlugin);
    pluginManager.register(collectionCompletionPlugin);
    pluginManager.register(deckBuildabilityPlugin);
    pluginManager.register(heroReferencePlugin);
    for (const plugin of userPlugins) {
      pluginManager.register(plugin);
    }
    const panel = createSettingsPanel(pluginManager);
    mountDashboardCard(() => panel.open());
    await pluginManager.startEnabledPlugins();
    startDevReloadWatcher(log);
    log("loader ready");
    return { api, backend, settings, pluginManager };
  }
  window.__pvzhtbotMod = { boot };
  boot();
})();
