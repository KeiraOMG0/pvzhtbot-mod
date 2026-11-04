// ==UserScript==
// @name         Greenhouse
// @namespace    https://pvzhtbot.com
// @version      0.3.1.202611040246
// @description  Greenhouse - an unofficial plugin-based client mod for pvzhtbot.com (collection tracker, deck buildability, hero reference, and more). Not affiliated with pvzhtbot.com; using it violates the site's Terms of Service.
// @author       Keira
// @match        https://pvzhtbot.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist/pvzhtbot-mod.meta.js
// @downloadURL  https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist/pvzhtbot-mod.user.js
// ==/UserScript==
var __PVZHTBOT_MOD_BUILD_ID__ = "1793760385740";
(() => {
  // <define:__GREENHOUSE_URLS__>
  var define_GREENHOUSE_URLS_default = { repo: "https://github.com/KeiraOMG0/pvzhtbot-mod", install: "https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist/pvzhtbot-mod.user.js", meta: "https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist/pvzhtbot-mod.meta.js", buildId: "https://raw.githubusercontent.com/KeiraOMG0/pvzhtbot-mod/master/userscript/dist/build-id.txt", devServer: "http://127.0.0.1:8787" };

  // src/core/page-network.js
  var pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  var blockers = /* @__PURE__ */ new Set();
  var fetchHandlers = /* @__PURE__ */ new Set();
  var installed = false;
  var nativeFetch = null;
  function toUrl(input) {
    try {
      const raw = typeof input === "string" ? input : input?.href ?? input?.url ?? String(input);
      return new URL(raw, pageWindow.location.href);
    } catch {
      return null;
    }
  }
  function isBlocked(url, kind) {
    if (!url || blockers.size === 0) return false;
    for (const fn of blockers) {
      try {
        if (fn(url, kind)) return true;
      } catch (err) {
        console.error("[Greenhouse] request blocker threw", err);
      }
    }
    return false;
  }
  function isBlockedScript(node) {
    return node?.nodeName === "SCRIPT" && Boolean(node.src) && isBlocked(toUrl(node.src), "script");
  }
  function install() {
    if (installed) return;
    installed = true;
    nativeFetch = pageWindow.fetch;
    pageWindow.fetch = function fetch2(input, init) {
      const url = toUrl(input);
      const passThrough = () => nativeFetch.call(pageWindow, input, init);
      if (isBlocked(url, "fetch")) {
        return Promise.resolve(new pageWindow.Response(null, { status: 204 }));
      }
      if (url && fetchHandlers.size) {
        const method = String(init?.method || typeof input === "object" && input?.method || "GET").toUpperCase();
        for (const handler of fetchHandlers) {
          try {
            const answer = handler({ url, method, passThrough });
            if (answer) return answer;
          } catch (err) {
            console.error("[Greenhouse] fetch handler threw", err);
          }
        }
      }
      return passThrough();
    };
    const navProto = pageWindow.Navigator?.prototype;
    if (navProto?.sendBeacon) {
      const nativeBeacon = navProto.sendBeacon;
      navProto.sendBeacon = function sendBeacon(url, data) {
        if (isBlocked(toUrl(url), "beacon")) return true;
        return nativeBeacon.call(this, url, data);
      };
    }
    const xhrProto = pageWindow.XMLHttpRequest?.prototype;
    if (xhrProto) {
      const nativeOpen = xhrProto.open;
      const nativeSend = xhrProto.send;
      xhrProto.open = function open(method, url, ...rest) {
        this.__ghBlocked = isBlocked(toUrl(url), "xhr");
        return nativeOpen.call(this, method, url, ...rest);
      };
      xhrProto.send = function send(body) {
        if (this.__ghBlocked) return void 0;
        return nativeSend.call(this, body);
      };
    }
    const nodeProto = pageWindow.Node?.prototype;
    if (nodeProto) {
      for (const name of ["appendChild", "insertBefore"]) {
        const native = nodeProto[name];
        nodeProto[name] = function(node, ...rest) {
          if (isBlockedScript(node)) return node;
          return native.call(this, node, ...rest);
        };
      }
    }
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (isBlockedScript(node)) {
            node.type = "javascript/blocked";
            node.remove();
          }
        }
      }
    }).observe(document.documentElement || document, { childList: true, subtree: true });
  }
  function addRequestBlocker(fn) {
    install();
    blockers.add(fn);
    return () => blockers.delete(fn);
  }
  function addFetchHandler(fn) {
    install();
    fetchHandlers.add(fn);
    return () => fetchHandlers.delete(fn);
  }
  function pageFetch(input, init) {
    return pageWindow.fetch(input, init);
  }

  // src/api/site-api.js
  var SITE_API_BASE = "https://api.pvzhtbot.com/tbotapp";
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
    constructor({ baseUrl = SITE_API_BASE } = {}) {
      this.baseUrl = baseUrl;
      this._csrfToken = null;
    }
    async _get(path) {
      const url = `${this.baseUrl}${path}`;
      const res = await pageFetch(url, {
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
      const doFetch = (csrfToken) => pageFetch(url, {
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
    /** CONFIRMED 2026-11-03: GET /legacy-decklists/ - bare array, decklists/ shape + inspiration/optimization/dates/deck_doc. Read by /legacydecks. */
    async getLegacyDecklists() {
      return this._get("/legacy-decklists/");
    }
    /** CONFIRMED 2026-11-03: GET /public-decks/ - {success, decks: [...], count}. Public user-made decks, read by /publicdecks. */
    async getPublicUserDecks() {
      return this._get("/public-decks/");
    }
    // ---- Heroes ----
    async getAllHeroInfo() {
      return this._get("/heroinfo/");
    }
    // ---- Guides / misc ----
    /**
     * CONFIRMED 2026-11-03: GET /keeporscrap/ - bare array, one entry per
     * side/class (+ one "Intro/Explanation" entry): {tierid, side,
     * card_class, image, reasoning, creator, faq}. `reasoning` is text with
     * `Craft:`/`Use:`/`Hold:`/`Usable:`/`Niche:` section lines and
     * **bold** card names. Read by /keeporscrap.
     */
    async getKeepOrScrap() {
      return this._get("/keeporscrap/");
    }
    /** CONFIRMED 2026-11-03: GET /site-updates/ - bare array of {id, title, page_url, content, category, published, ...}. Read by /updates. */
    async getSiteUpdates() {
      return this._get("/site-updates/");
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
    // Per-plugin option values, stored as { pluginOptions: { [id]: { [key]: value } } }.
    // Only values the user actually changed are stored; defaults live in
    // the plugin's own `options` schema so changing a default in code
    // reaches everyone who never touched that setting.
    getPluginOption(pluginId, key, defaultValue) {
      const all = this.get("pluginOptions", {});
      const mine = all[pluginId] || {};
      return key in mine ? mine[key] : defaultValue;
    }
    setPluginOption(pluginId, key, value) {
      const all = this.get("pluginOptions", {});
      all[pluginId] = { ...all[pluginId] || {}, [key]: value };
      this.set("pluginOptions", all);
    }
    resetPluginOptions(pluginId) {
      const all = this.get("pluginOptions", {});
      delete all[pluginId];
      this.set("pluginOptions", all);
    }
  };

  // src/core/plugin-manager.js
  var PluginManager = class {
    constructor({ settings, context }) {
      this.settings = settings;
      this.baseContext = context;
      this._plugins = /* @__PURE__ */ new Map();
      this._meta = /* @__PURE__ */ new Map();
      this._teardowns = /* @__PURE__ */ new Map();
      this._active = /* @__PURE__ */ new Set();
      this._errors = /* @__PURE__ */ new Map();
      this._optionListeners = /* @__PURE__ */ new Map();
      this._eventListeners = /* @__PURE__ */ new Map();
    }
    // ---- events ----
    on(event, cb) {
      if (!this._eventListeners.has(event)) this._eventListeners.set(event, /* @__PURE__ */ new Set());
      this._eventListeners.get(event).add(cb);
      return () => this._eventListeners.get(event)?.delete(cb);
    }
    _emit(event, payload) {
      for (const cb of this._eventListeners.get(event) || []) {
        try {
          cb(payload);
        } catch (err) {
          console.error(`[Greenhouse] event listener for ${event} threw`, err);
        }
      }
    }
    // ---- registration ----
    register(plugin, meta = {}) {
      if (!plugin || !plugin.id) {
        throw new Error("Plugin must have a unique `id`");
      }
      if (this._plugins.has(plugin.id)) {
        throw new Error(`Plugin id "${plugin.id}" is already registered`);
      }
      if (meta.folder && meta.folder !== plugin.id) {
        this.baseContext.log(
          `plugin folder "${meta.folder}" declares id "${plugin.id}" - keep them the same to avoid confusion`,
          "error"
        );
      }
      this._plugins.set(plugin.id, plugin);
      this._meta.set(plugin.id, { builtIn: true, ...meta });
      return this;
    }
    get(pluginId) {
      return this._plugins.get(pluginId);
    }
    /** Sorted for display: required first, then built-ins, then by name. */
    list() {
      return [...this._plugins.values()].map((p) => ({
        id: p.id,
        name: p.name || p.id,
        description: p.description || "",
        authors: p.authors || [],
        tags: p.tags || [],
        dependencies: p.dependencies || [],
        options: p.options || {},
        enabled: this.isEnabled(p.id),
        active: this._active.has(p.id),
        required: Boolean(p.required),
        builtIn: this._meta.get(p.id)?.builtIn !== false,
        lastError: this._errors.get(p.id) || null
      })).sort(
        (a, b) => Number(b.required) - Number(a.required) || Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name)
      );
    }
    isEnabled(pluginId) {
      const plugin = this._plugins.get(pluginId);
      if (plugin?.required) return true;
      const defaultEnabled = plugin ? Boolean(plugin.defaultEnabled) : false;
      return this.settings.isPluginEnabled(pluginId, defaultEnabled);
    }
    isActive(pluginId) {
      return this._active.has(pluginId);
    }
    getLastError(pluginId) {
      return this._errors.get(pluginId) || null;
    }
    /** Plugins that list `pluginId` as a dependency (directly). */
    dependents(pluginId) {
      return [...this._plugins.values()].filter((p) => (p.dependencies || []).includes(pluginId));
    }
    // ---- options ----
    getOption(pluginId, key) {
      const schema = this._plugins.get(pluginId)?.options?.[key];
      return this.settings.getPluginOption(pluginId, key, schema ? schema.default : void 0);
    }
    setOption(pluginId, key, value) {
      const schema = this._plugins.get(pluginId)?.options?.[key];
      if (!schema) throw new Error(`Plugin "${pluginId}" has no option "${key}"`);
      const coerced = coerceOption(schema, value);
      this.settings.setPluginOption(pluginId, key, coerced);
      for (const cb of this._optionListeners.get(pluginId) || []) {
        try {
          cb(key, coerced);
        } catch (err) {
          this._recordError(pluginId, "option-listener", err);
        }
      }
      this._emit("option:changed", { id: pluginId, key, value: coerced, restartNeeded: Boolean(schema.restartNeeded) });
      return coerced;
    }
    resetOptions(pluginId) {
      this.settings.resetPluginOptions(pluginId);
      const plugin = this._plugins.get(pluginId);
      for (const [key, schema] of Object.entries(plugin?.options || {})) {
        for (const cb of this._optionListeners.get(pluginId) || []) {
          try {
            cb(key, schema.default);
          } catch (err) {
            this._recordError(pluginId, "option-listener", err);
          }
        }
      }
    }
    _optionsApi(pluginId) {
      const manager = this;
      const store = new Proxy(
        {},
        {
          get: (_, key) => typeof key === "string" ? manager.getOption(pluginId, key) : void 0,
          set: (_, key, value) => {
            manager.setOption(pluginId, key, value);
            return true;
          }
        }
      );
      return {
        get: (key) => manager.getOption(pluginId, key),
        set: (key, value) => manager.setOption(pluginId, key, value),
        store,
        onChange(cb) {
          if (!manager._optionListeners.has(pluginId)) manager._optionListeners.set(pluginId, /* @__PURE__ */ new Set());
          manager._optionListeners.get(pluginId).add(cb);
          return () => manager._optionListeners.get(pluginId)?.delete(cb);
        }
      };
    }
    /** The facade core plugins (crash-handler) get as ctx.plugins. */
    _pluginsApi() {
      return {
        list: () => this.list(),
        isEnabled: (id) => this.isEnabled(id),
        isActive: (id) => this.isActive(id),
        setEnabled: (id, enabled) => this.setEnabled(id, enabled),
        getLastError: (id) => this.getLastError(id),
        on: (event, cb) => this.on(event, cb)
      };
    }
    _contextFor(pluginId) {
      const baseLog = this.baseContext.log;
      return {
        ...this.baseContext,
        log: (message, level) => baseLog(`[plugin:${pluginId}] ${message}`, level),
        options: this._optionsApi(pluginId),
        plugins: this._pluginsApi()
      };
    }
    // ---- lifecycle ----
    /**
     * Runs `earlyInit(ctx)` of every enabled plugin that has one, highest
     * `priority` first, synchronously at document-start - before the
     * site's own scripts and before the DOM exists (no document.body).
     * For hooks that must beat the site (network interception). Call once,
     * before startEnabledPlugins(); `init` still runs later as normal.
     */
    runEarlyHooks() {
      const ordered = [...this._plugins.values()].sort((a, b) => (b.priority || 0) - (a.priority || 0));
      for (const plugin of ordered) {
        if (typeof plugin.earlyInit !== "function" || !this.isEnabled(plugin.id)) continue;
        try {
          plugin.earlyInit(this._contextFor(plugin.id));
        } catch (err) {
          this._recordError(plugin.id, "early", err);
        }
      }
    }
    /** Starts every enabled plugin, highest `priority` first. Call once at startup. */
    async startEnabledPlugins() {
      const ordered = [...this._plugins.values()].sort((a, b) => (b.priority || 0) - (a.priority || 0));
      for (const plugin of ordered) {
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
      if (enabled) {
        for (const depId of plugin.dependencies || []) {
          if (!this._plugins.has(depId)) {
            this.baseContext.log(`[plugin:${pluginId}] missing dependency "${depId}"`, "error");
          } else if (!this.isEnabled(depId) || !this._active.has(depId)) {
            await this.setEnabled(depId, true);
          }
        }
        if (!this._active.has(pluginId)) await this._activate(pluginId);
      } else {
        for (const dependent of this.dependents(pluginId)) {
          if (this.isEnabled(dependent.id) && !dependent.required) await this.setEnabled(dependent.id, false);
        }
        if (this._active.has(pluginId)) this._deactivate(pluginId);
      }
    }
    async _activate(pluginId) {
      const plugin = this._plugins.get(pluginId);
      for (const depId of plugin.dependencies || []) {
        if (!this._active.has(depId) && this._plugins.has(depId) && this.isEnabled(depId)) {
          await this._activate(depId);
        }
      }
      if (this._active.has(pluginId)) return true;
      this._emit("plugin:starting", { id: pluginId });
      try {
        const teardown = await plugin.init(this._contextFor(pluginId));
        this._teardowns.set(pluginId, typeof teardown === "function" ? teardown : plugin.teardown);
        this._active.add(pluginId);
        this._errors.delete(pluginId);
        this.baseContext.log(`[plugin:${pluginId}] activated`);
        this._emit("plugin:started", { id: pluginId });
        return true;
      } catch (err) {
        this._recordError(pluginId, "init", err);
        return false;
      }
    }
    _deactivate(pluginId) {
      const teardown = this._teardowns.get(pluginId);
      try {
        if (typeof teardown === "function") teardown();
      } catch (err) {
        this._recordError(pluginId, "teardown", err);
      }
      this._teardowns.delete(pluginId);
      this._active.delete(pluginId);
      this._optionListeners.delete(pluginId);
      this.baseContext.log(`[plugin:${pluginId}] deactivated`);
      this._emit("plugin:stopped", { id: pluginId });
    }
    _recordError(pluginId, phase, err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this._errors.set(pluginId, {
        phase,
        message: error.message,
        stack: error.stack || "",
        at: (/* @__PURE__ */ new Date()).toISOString()
      });
      this.baseContext.log(`[plugin:${pluginId}] ${phase} failed: ${error.message}`, "error");
      this._emit("plugin:error", { id: pluginId, phase, error });
    }
  };
  function coerceOption(schema, value) {
    switch (schema.type) {
      case "boolean":
        return Boolean(value);
      case "number": {
        let n = Number(value);
        if (!Number.isFinite(n)) n = schema.default;
        if (typeof schema.min === "number") n = Math.max(schema.min, n);
        if (typeof schema.max === "number") n = Math.min(schema.max, n);
        return n;
      }
      case "select":
        return schema.choices.some((c) => c.value === value) ? value : schema.default;
      default:
        return value == null ? "" : String(value);
    }
  }

  // src/core/brand.js
  var BRAND = Object.freeze({
    name: "Greenhouse",
    tagline: "An unofficial client mod for pvzhtbot.com",
    logPrefix: "[Greenhouse]",
    repoUrl: define_GREENHOUSE_URLS_default.repo,
    // injected by build.js from release.config.js
    disclaimer: "Unofficial and not affiliated with pvzhtbot.com or its owner. Using it violates pvzhtbot.com's Terms of Service \u2014 use at your own risk."
  });
  var THEME = Object.freeze({
    bg: "#14161a",
    bgRaised: "#1b1e23",
    border: "#2a2d33",
    text: "#eeeeee",
    textMuted: "#9a9a9a",
    accent: "#5fd17a",
    // greenhouse green
    accentStrong: "#1f6f3f",
    accentBorder: "#2f5a3a",
    warn: "#e0c96a",
    warnBg: "#2a2410",
    warnBorder: "#4d4420",
    danger: "#ff7b7b",
    dangerBg: "#2a1414",
    dangerBorder: "#5a2f2f",
    font: "13px system-ui, sans-serif"
  });

  // src/ui/settings-panel.js
  var PANEL_ID = "greenhouse-settings-panel";
  var BACKDROP_ID = "greenhouse-settings-backdrop";
  var P = `#${PANEL_ID}`;
  var STYLES = `
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
    const style = document.createElement("style");
    style.id = `${PANEL_ID}-styles`;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
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
    if (schema.type === "boolean") {
      const input2 = el("input", { type: "checkbox" });
      input2.checked = Boolean(value);
      input2.addEventListener("change", () => commit(input2.checked));
      return input2;
    }
    if (schema.type === "number") {
      const input2 = el("input", { type: "number" });
      if (typeof schema.min === "number") input2.min = schema.min;
      if (typeof schema.max === "number") input2.max = schema.max;
      if (typeof schema.step === "number") input2.step = schema.step;
      input2.value = value;
      input2.addEventListener("change", () => {
        commit(input2.value);
        input2.value = pluginManager.getOption(pluginId, key);
      });
      return input2;
    }
    if (schema.type === "select") {
      const select = el("select");
      for (const choice of schema.choices) {
        const opt = el("option", { text: choice.label });
        opt.value = String(choice.value);
        if (choice.value === value) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => {
        const choice = schema.choices.find((c) => String(c.value) === select.value);
        commit(choice ? choice.value : schema.default);
      });
      return select;
    }
    const input = el("input", { type: "text" });
    input.value = value;
    input.addEventListener("change", () => commit(input.value));
    return input;
  }
  function renderOptions(info, pluginManager, onChanged, rerender) {
    const box = el("div", { class: "gh-options" });
    for (const [key, schema] of Object.entries(info.options)) {
      const label = el("div", {}, [
        el("div", { class: "gh-opt-label", text: schema.label || key }),
        schema.description ? el("div", { class: "gh-opt-desc", text: schema.description }) : null
      ]);
      box.appendChild(
        el("label", { class: "gh-opt" }, [label, renderOptionControl(info.id, key, schema, pluginManager, onChanged)])
      );
    }
    box.appendChild(
      el("button", {
        class: "gh-reset",
        text: "Reset to defaults",
        onclick: () => {
          pluginManager.resetOptions(info.id);
          onChanged({ restartNeeded: Object.values(info.options).some((o) => o.restartNeeded) });
          rerender();
        }
      })
    );
    return box;
  }
  function renderPluginRow(info, ctx) {
    const { pluginManager, expanded, onToggle, onOptionChanged, rerender } = ctx;
    const hasOptions = Object.keys(info.options).length > 0;
    const isOpen = expanded.has(info.id);
    const nameRow = el("div", { class: "gh-name" }, [document.createTextNode(info.name)]);
    if (!info.builtIn) nameRow.appendChild(el("span", { class: "gh-badge gh-badge-user", text: "User" }));
    if (info.lastError) {
      nameRow.appendChild(
        el("span", {
          class: "gh-badge gh-badge-crash",
          text: "Crashed",
          title: `${info.lastError.phase}: ${info.lastError.message}`
        })
      );
    }
    const meta = [];
    if (info.authors.length) meta.push(`by ${info.authors.join(", ")}`);
    if (info.dependencies.length) meta.push(`needs ${info.dependencies.join(", ")}`);
    const left = el("div", {}, [
      nameRow,
      info.description ? el("div", { class: "gh-desc", text: info.description }) : null,
      meta.length ? el("div", { class: "gh-meta", text: meta.join(" \xB7 ") }) : null
    ]);
    const controls = el("div", { class: "gh-controls" });
    if (hasOptions) {
      controls.appendChild(
        el("button", {
          class: "gh-gear",
          text: "\u2699",
          title: "Plugin settings",
          "aria-expanded": String(isOpen),
          onclick: () => {
            if (isOpen) expanded.delete(info.id);
            else expanded.add(info.id);
            rerender();
          }
        })
      );
    }
    if (info.required) {
      controls.appendChild(el("span", { class: "gh-badge gh-badge-required", text: "Required" }));
    } else {
      const checkbox = el("input", { type: "checkbox", title: info.enabled ? "Disable" : "Enable" });
      checkbox.checked = info.enabled;
      checkbox.addEventListener("change", () => onToggle(info.id, checkbox.checked));
      controls.appendChild(checkbox);
    }
    const row = el("div", { class: "gh-row" }, [el("div", { class: "gh-row-main" }, [left, controls])]);
    if (hasOptions && isOpen) row.appendChild(renderOptions(info, pluginManager, onOptionChanged, rerender));
    return row;
  }
  function createSettingsPanel(pluginManager) {
    injectStylesOnce();
    let panel = document.getElementById(PANEL_ID);
    let backdrop = document.getElementById(BACKDROP_ID);
    if (!panel || !backdrop) {
      backdrop = el("div", { id: BACKDROP_ID });
      backdrop.style.display = "none";
      document.body.appendChild(backdrop);
      panel = el("div", { id: PANEL_ID });
      panel.style.display = "none";
      document.body.appendChild(panel);
    }
    let needsRefresh = false;
    let query = "";
    const expanded = /* @__PURE__ */ new Set();
    function matches(info) {
      if (!query) return true;
      const hay = [info.name, info.id, info.description, ...info.tags, ...info.authors].join(" ").toLowerCase();
      return hay.includes(query);
    }
    function render() {
      const prevScroll = panel.querySelector(".gh-body")?.scrollTop || 0;
      const hadFocus = document.activeElement?.classList?.contains("gh-search");
      panel.innerHTML = "";
      const search2 = el("input", { class: "gh-search", type: "search", placeholder: "Search plugins\u2026" });
      search2.value = query;
      search2.addEventListener("input", () => {
        query = search2.value.trim().toLowerCase();
        render();
      });
      const plugins = pluginManager.list();
      const enabledCount = plugins.filter((p) => p.enabled).length;
      panel.appendChild(
        el("div", { class: "gh-head" }, [
          el("div", { class: "gh-title-row" }, [
            el("div", { class: "gh-brand" }, [
              el("h3", { text: `\u{1F331} ${BRAND.name}` }),
              el("span", { text: `${enabledCount}/${plugins.length} plugins on` })
            ]),
            el("button", { class: "gh-close", text: "\u2715", title: "Close", onclick: close })
          ]),
          search2
        ])
      );
      const body = el("div", { class: "gh-body" });
      const visible = plugins.filter(matches);
      if (plugins.length === 0) {
        body.appendChild(el("div", { class: "gh-empty", text: "No plugins registered yet." }));
      } else if (visible.length === 0) {
        body.appendChild(el("div", { class: "gh-empty", text: `No plugins match "${query}".` }));
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
        }
      };
      for (const info of visible) body.appendChild(renderPluginRow(info, rowCtx));
      panel.appendChild(body);
      if (needsRefresh) {
        panel.appendChild(
          el("div", { class: "gh-notice" }, [
            el("span", { text: "Some changes fully apply only after a page refresh." }),
            el("button", { text: "Refresh now", onclick: () => location.reload() })
          ])
        );
      }
      const foot = el("div", { class: "gh-foot" }, [
        document.createTextNode(`${BRAND.disclaimer} `),
        el("a", { href: BRAND.repoUrl, target: "_blank", rel: "noopener noreferrer", text: "Source" })
      ]);
      panel.appendChild(foot);
      const newBody = panel.querySelector(".gh-body");
      if (newBody) newBody.scrollTop = prevScroll;
      if (hadFocus) {
        search2.focus();
        search2.setSelectionRange(search2.value.length, search2.value.length);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    function open() {
      needsRefresh = false;
      render();
      backdrop.style.display = "block";
      panel.style.display = "flex";
      document.addEventListener("keydown", onKey);
    }
    function close() {
      backdrop.style.display = "none";
      panel.style.display = "none";
      document.removeEventListener("keydown", onKey);
    }
    function toggle() {
      if (panel.style.display === "none") open();
      else close();
    }
    backdrop.onclick = close;
    return { open, close, toggle, isOpen: () => panel.style.display !== "none", refresh: render };
  }

  // src/ui/dashboard-card.js
  var GRID_SELECTOR = ".user-dashboard-grid";
  var CARD_MARKER_ATTR = "data-greenhouse-card";
  function buildCard(onOpenSettings) {
    const card = document.createElement("a");
    card.href = "#";
    card.className = "user-dashboard-card";
    card.setAttribute(CARD_MARKER_ATTR, "true");
    const label = document.createElement("span");
    label.className = "user-dashboard-card-label";
    label.textContent = `\u{1F331} ${BRAND.name}`;
    const action = document.createElement("span");
    action.className = "user-dashboard-card-action";
    action.textContent = "Plugins & settings \u2192";
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
  function addDashboardTile({ id, label, action = "Open \u2192", onClick }) {
    const marker = `data-greenhouse-tile-${id}`;
    function build() {
      const card = document.createElement("a");
      card.href = "#";
      card.className = "user-dashboard-card";
      card.setAttribute(marker, "true");
      const l = document.createElement("span");
      l.className = "user-dashboard-card-label";
      l.textContent = label;
      const a = document.createElement("span");
      a.className = "user-dashboard-card-action";
      a.textContent = action;
      card.append(l, a);
      card.addEventListener("click", (e) => {
        e.preventDefault();
        onClick();
      });
      return card;
    }
    function tryInject() {
      if (!isDashboardHome()) return;
      const grid = document.querySelector(GRID_SELECTOR);
      if (!grid || grid.querySelector(`[${marker}]`)) return;
      grid.appendChild(build());
    }
    tryInject();
    const observer = new MutationObserver(tryInject);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelector(`[${marker}]`)?.remove();
    };
  }

  // src/core/dev-reload.js
  var DEV_SERVER_ORIGIN = define_GREENHOUSE_URLS_default.devServer;

  // src/ui/toast.js
  var STACK_ID = "greenhouse-toast-stack";
  var STYLE_ID = "greenhouse-toast-styles";
  var KIND_COLORS = {
    info: THEME.border,
    success: THEME.accentBorder,
    warn: THEME.warnBorder,
    error: THEME.dangerBorder
  };
  var KIND_TITLE = {
    info: THEME.text,
    success: THEME.accent,
    warn: THEME.warn,
    error: THEME.danger
  };
  var STYLES2 = `
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
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = STYLES2;
      document.head.appendChild(style);
    }
    let stack = document.getElementById(STACK_ID);
    if (!stack) {
      stack = document.createElement("div");
      stack.id = STACK_ID;
      document.body.appendChild(stack);
    }
    return stack;
  }
  function showToast({ title, body = "", kind = "info", timeoutMs = 6e3, actions = [] } = {}) {
    const stack = ensureStack();
    const el2 = document.createElement("div");
    el2.className = "gh-toast";
    el2.style.borderLeftColor = KIND_COLORS[kind] || KIND_COLORS.info;
    if (title) {
      const t = document.createElement("div");
      t.className = "gh-toast-title";
      t.style.color = KIND_TITLE[kind] || KIND_TITLE.info;
      t.textContent = title;
      el2.appendChild(t);
    }
    if (body) {
      const b = document.createElement("div");
      b.className = "gh-toast-body";
      b.textContent = body;
      el2.appendChild(b);
    }
    let timer = null;
    const close = () => {
      clearTimeout(timer);
      el2.remove();
    };
    const allActions = [...actions, { label: "Dismiss", onClick: () => {
    } }];
    const row = document.createElement("div");
    row.className = "gh-toast-actions";
    for (const action of allActions) {
      const btn = document.createElement("button");
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        try {
          action.onClick?.();
        } finally {
          if (action.keepOpen !== true) close();
        }
      });
      row.appendChild(btn);
    }
    el2.appendChild(row);
    stack.appendChild(el2);
    if (timeoutMs > 0) timer = setTimeout(close, timeoutMs);
    return { close };
  }

  // src/core/define-plugin.js
  var OPTION_TYPES = /* @__PURE__ */ new Set(["boolean", "number", "string", "select"]);
  var ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  function definePlugin(plugin) {
    const where = plugin?.id ? `plugin "${plugin.id}"` : "a plugin";
    if (!plugin || typeof plugin !== "object") throw new Error("definePlugin() needs an object");
    if (!ID_RE.test(plugin.id || "")) throw new Error(`${where}: id must be kebab-case`);
    if (!plugin.name) throw new Error(`${where}: missing name`);
    if (typeof plugin.init !== "function") throw new Error(`${where}: missing init()`);
    if (plugin.earlyInit != null && typeof plugin.earlyInit !== "function") {
      throw new Error(`${where}: earlyInit must be a function`);
    }
    for (const [key, opt] of Object.entries(plugin.options || {})) {
      if (!OPTION_TYPES.has(opt?.type)) {
        throw new Error(`${where}: option "${key}" has invalid type "${opt?.type}"`);
      }
      if (!("default" in opt)) throw new Error(`${where}: option "${key}" needs a default`);
      if (opt.type === "select" && !Array.isArray(opt.choices)) {
        throw new Error(`${where}: select option "${key}" needs choices[]`);
      }
    }
    return {
      description: "",
      authors: [],
      tags: [],
      defaultEnabled: false,
      required: false,
      priority: 0,
      dependencies: [],
      options: {},
      ...plugin
    };
  }

  // src/plugins/analytics-blocker/index.js
  var RULES = [
    {
      // Cloudflare Web Analytics
      match: (u) => u.hostname === "static.cloudflareinsights.com" || u.hostname === "cloudflareinsights.com" || u.hostname.endsWith("pvzhtbot.com") && u.pathname.startsWith("/cdn-cgi/rum")
    },
    {
      // Vercel Web Analytics / Speed Insights
      match: (u) => u.hostname === "va.vercel-scripts.com" || u.hostname.endsWith("pvzhtbot.com") && (u.pathname.startsWith("/_vercel/insights") || u.pathname.startsWith("/_vercel/speed-insights"))
    }
  ];
  var removeBlocker = null;
  var blockedCount = 0;
  function install2(ctx) {
    if (removeBlocker) return;
    removeBlocker = addRequestBlocker((url, kind) => {
      if (!RULES.some((r) => r.match(url))) return false;
      blockedCount++;
      if (ctx.options.get("logBlocked")) ctx.log(`blocked ${kind} ${url.origin}${url.pathname}`);
      return true;
    });
  }
  var analyticsBlockerPlugin = definePlugin({
    id: "analytics-blocker",
    name: "Analytics Blocker",
    description: "Blocks the site's Cloudflare and Vercel visitor-analytics scripts (page views, referrer, device/browser, country, load timings). Site features are unaffected.",
    tags: ["privacy"],
    defaultEnabled: true,
    required: true,
    // core privacy plugin: always on, no toggle, nothing to opt out of
    priority: 90,
    // after crash-handler, before everything else
    options: {
      logBlocked: {
        type: "boolean",
        label: "Log each blocked request to the console",
        default: false
      }
    },
    earlyInit(ctx) {
      install2(ctx);
    },
    async init(ctx) {
      install2(ctx);
      ctx.log(`active (${blockedCount} request(s) blocked so far this page)`);
      return () => {
        removeBlocker?.();
        removeBlocker = null;
      };
    }
  });
  var analytics_blocker_default = analyticsBlockerPlugin;

  // src/plugins/api-cache/index.js
  var CACHE_NAME = "greenhouse-api-v1";
  var API = new URL(SITE_API_BASE);
  var CACHEABLE_PATHS = new Set(
    [
      "cardinfo/",
      "heroinfo/",
      "decklists/",
      "legacy-decklists/",
      "public-decks/",
      "keeporscrap/",
      "site-updates/",
      "servers/",
      "card-count/",
      "decklist-count/",
      "legacy-decklist-count/",
      "public-user-decks-count/"
    ].map((p) => `${API.pathname.replace(/\/$/, "")}/${p}`)
  );
  var memory = /* @__PURE__ */ new Map();
  var inflight = /* @__PURE__ */ new Map();
  var stats = { hit: 0, stale: 0, miss: 0, fallback: 0 };
  var removeHandler = null;
  function isCacheable(url, method) {
    return method === "GET" && url.origin === API.origin && CACHEABLE_PATHS.has(url.pathname);
  }
  async function openCache() {
    try {
      return await caches.open(CACHE_NAME);
    } catch {
      return null;
    }
  }
  async function readEntry(key) {
    if (memory.has(key)) return memory.get(key);
    const cache = await openCache();
    const res = await cache?.match(key);
    if (!res) return null;
    const entry = {
      text: await res.text(),
      status: res.status,
      contentType: res.headers.get("content-type") || "application/json",
      at: Number(res.headers.get("x-greenhouse-cached-at")) || 0
    };
    memory.set(key, entry);
    return entry;
  }
  async function writeEntry(key, entry) {
    memory.set(key, entry);
    const cache = await openCache();
    await cache?.put(
      key,
      new Response(entry.text, {
        status: entry.status,
        headers: { "content-type": entry.contentType, "x-greenhouse-cached-at": String(entry.at) }
      })
    );
  }
  function download(key, passThrough) {
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      const res = await passThrough();
      const entry = {
        text: await res.text(),
        status: res.status,
        contentType: res.headers.get("content-type") || "application/json",
        at: Date.now()
      };
      if (res.ok) await writeEntry(key, entry).catch(() => {
      });
      return entry;
    })();
    inflight.set(key, p);
    p.finally(() => inflight.delete(key)).catch(() => {
    });
    return p;
  }
  function toPageResponse(entry) {
    return new pageWindow.Response(entry.text, {
      status: entry.status,
      headers: { "content-type": entry.contentType }
    });
  }
  async function serve(key, passThrough, ctx) {
    const ttlMs = ctx.options.get("ttlMinutes") * 6e4;
    const cached = await readEntry(key).catch(() => null);
    const age = cached ? Date.now() - cached.at : Infinity;
    if (cached && age < ttlMs) {
      stats.hit++;
      return toPageResponse(cached);
    }
    if (cached && ctx.options.get("instant")) {
      stats.stale++;
      download(key, passThrough).catch((err) => ctx.log(`background refresh failed: ${err.message}`, "error"));
      return toPageResponse(cached);
    }
    stats.miss++;
    try {
      const fresh = await download(key, passThrough);
      if (fresh.status >= 500 && cached) {
        stats.fallback++;
        return toPageResponse(cached);
      }
      return toPageResponse(fresh);
    } catch (err) {
      if (cached) {
        stats.fallback++;
        return toPageResponse(cached);
      }
      throw err;
    }
  }
  async function clearCache() {
    memory.clear();
    try {
      await caches.delete(CACHE_NAME);
    } catch {
    }
  }
  function install3(ctx) {
    if (removeHandler) return;
    removeHandler = addFetchHandler(({ url, method, passThrough }) => {
      if (!isCacheable(url, method)) return void 0;
      if (ctx.options.get("ttlMinutes") <= 0) return void 0;
      return serve(url.href, passThrough, ctx);
    });
    pageWindow.__greenhouse = {
      ...pageWindow.__greenhouse || {},
      clearApiCache: clearCache,
      apiCacheStats: () => ({ ...stats, entriesInMemory: memory.size })
    };
  }
  var apiCachePlugin = definePlugin({
    id: "api-cache",
    name: "Faster Loading (API Cache)",
    description: "Caches the site\u2019s large shared data (cards, heroes, decklists, Keep or Scrap, updates) so pages load instantly instead of re-downloading ~1 MB every visit. Your own collection and decks are never cached.",
    tags: ["performance"],
    defaultEnabled: false,
    // opt-in: trades up to ttlMinutes of staleness for speed
    options: {
      ttlMinutes: {
        type: "number",
        label: "Treat cached data as fresh for (minutes)",
        description: "Within this window, no request is made at all. 0 turns caching off.",
        default: 10,
        min: 0,
        max: 1440
      },
      instant: {
        type: "boolean",
        label: "Show cached data instantly, refresh in the background",
        description: "After the window above, still show the cached copy right away and update it for next time. Off = wait for fresh data.",
        default: true
      }
    },
    earlyInit(ctx) {
      install3(ctx);
    },
    async init(ctx) {
      install3(ctx);
      return () => {
        removeHandler?.();
        removeHandler = null;
        clearCache();
      };
    }
  });
  var api_cache_default = apiCachePlugin;

  // src/ui/modal.js
  var STYLE_ID2 = "greenhouse-modal-styles";
  var STYLES3 = `
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
    if (document.getElementById(STYLE_ID2)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID2;
    style.textContent = STYLES3;
    document.head.appendChild(style);
  }
  function createModal({ id, title, subtitle = "", width = 640, onOpen, onClose } = {}) {
    let backdrop = null;
    let root = null;
    let titleEl = null;
    const body = document.createElement("div");
    body.className = "gh-modal-body";
    function build() {
      ensureStyles();
      backdrop = document.createElement("div");
      backdrop.className = "gh-modal-backdrop";
      backdrop.addEventListener("click", close);
      root = document.createElement("div");
      root.className = "gh-modal";
      root.id = `greenhouse-modal-${id}`;
      root.style.width = `${width}px`;
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-label", title);
      const head = document.createElement("div");
      head.className = "gh-modal-head";
      titleEl = document.createElement("h3");
      titleEl.className = "gh-modal-title";
      setTitle(title, subtitle);
      const x = document.createElement("button");
      x.className = "gh-modal-x";
      x.textContent = "\u2715";
      x.title = "Close (Esc)";
      x.addEventListener("click", close);
      head.append(titleEl, x);
      root.append(head, body);
    }
    function setTitle(text, sub = "") {
      if (!titleEl) return;
      titleEl.textContent = text;
      const s = document.createElement("small");
      s.textContent = sub || BRAND.name;
      titleEl.appendChild(s);
    }
    function onKey(e) {
      if (e.key === "Escape") {
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
      document.addEventListener("keydown", onKey, true);
      onOpen?.();
    }
    function close() {
      if (!isOpen()) return;
      backdrop.remove();
      root.remove();
      document.removeEventListener("keydown", onKey, true);
      onClose?.();
    }
    return { open, close, isOpen, body, setTitle, destroy: close };
  }

  // src/lib/card-text.js
  function cleanEmoji(text) {
    return String(text || "").replace(/<a?:[A-Za-z0-9_-]+:\d+>\s*(?=__)/g, "").replace(/(\d)<a?:([A-Za-z0-9_-]+):\d+>/g, "$1 $2").replace(/<a?:([A-Za-z0-9_-]+):\d+>/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/\r/g, "").trim();
  }
  function parseStats(stats2) {
    const out = { cost: null, strength: null, strengthIcon: null, health: null, healthIcon: null };
    const tokens = [...String(stats2 || "").matchAll(/(\S+)\s*<a?:([A-Za-z]+):\d+>/g)].map((m) => ({
      value: m[1],
      icon: m[2]
    }));
    if (tokens[0]) out.cost = tokens[0].value;
    if (tokens.length >= 3) {
      out.strength = tokens[1].value;
      out.strengthIcon = tokens[1].icon;
      out.health = tokens[2].value;
      out.healthIcon = tokens[2].icon;
    }
    return out;
  }
  function normName(name) {
    return String(name || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();
  }
  function looseKey(name) {
    return normName(name).replace(/[^a-z0-9]/g, "");
  }
  function editDistance(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        rowMin = Math.min(rowMin, cur[j]);
      }
      if (rowMin > cap) return cap + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function createCardMatcher(cards) {
    const exact = /* @__PURE__ */ new Map();
    const loose = /* @__PURE__ */ new Map();
    for (const c of cards) {
      exact.set(normName(c.card_name), c);
      loose.set(looseKey(c.card_name), c);
    }
    const looseKeys = [...loose.keys()];
    return function match(name) {
      const hit = exact.get(normName(name)) || loose.get(looseKey(name));
      if (hit) return hit;
      const key = looseKey(name);
      if (key.length < 6) return null;
      const cap = key.length >= 12 ? 2 : 1;
      let best = null;
      let bestD = cap + 1;
      let tie = false;
      for (const k of looseKeys) {
        const d = editDistance(key, k, cap);
        if (d < bestD) {
          best = k;
          bestD = d;
          tie = false;
        } else if (d === bestD && d <= cap) {
          tie = true;
        }
      }
      return best && bestD <= cap && !tie ? loose.get(best) : null;
    };
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

  // src/plugins/card-quick-search/index.js
  var STYLE_ID3 = "greenhouse-cqs-styles";
  var STYLES4 = `
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
  var HOTKEYS = {
    "ctrl-k": { label: "Ctrl+K", test: (e) => (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k" },
    "alt-k": { label: "Alt+K", test: (e) => e.altKey && !e.ctrlKey && e.key.toLowerCase() === "k" },
    slash: { label: "/", test: (e) => e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey, skipInInputs: true }
  };
  function isTypingTarget(el2) {
    return el2 && (el2.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el2.tagName));
  }
  function indexCards(cards) {
    return cards.map((c) => {
      const stats2 = parseStats(c.stats);
      const ability = cleanEmoji(c.ability);
      const traits = cleanEmoji(c.traits);
      const rarity = String(c.set_rarity || "").replace(/^(\w+)\s*-\s*/, "$1 - ");
      return {
        raw: c,
        name: c.card_name,
        key: normName(c.card_name),
        side: /^plant/i.test(c.side) ? "Plant" : "Zombie",
        cls: c.card_type || "",
        tribe: c.description || "",
        traits,
        ability,
        flavor: cleanEmoji(c.flavor_text),
        rarity,
        stats: stats2,
        thumb: c.thumbnail,
        aliases: normName(c.aliases === "NULL" ? "" : c.aliases),
        hay: normName([c.card_name, c.aliases, c.card_type, c.description, traits, ability, rarity].join(" | "))
      };
    });
  }
  function search(index, query, limit) {
    const q = normName(query);
    if (!q) return [];
    const words = q.split(" ").filter(Boolean);
    const scored = [];
    for (const card of index) {
      if (!words.every((w) => card.hay.includes(w))) continue;
      let score = 0;
      if (card.key === q) score += 1e3;
      else if (card.key.startsWith(q)) score += 500;
      else if (card.key.includes(q)) score += 300;
      else if (card.aliases.split(/,\s*/).some((a) => a === q)) score += 400;
      else if (card.aliases.includes(q)) score += 150;
      else if (words.every((w) => card.key.includes(w))) score += 200;
      score -= card.name.length / 100;
      scored.push([score, card]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, limit).map(([, c]) => c);
  }
  function statLine(s) {
    const parts = [];
    if (s.cost !== null) parts.push(`${s.cost} cost`);
    if (s.strength !== null || s.health !== null) parts.push(`${s.strength ?? "\u2013"}/${s.health ?? "\u2013"}`);
    return parts.join(" \xB7 ");
  }
  var card_quick_search_default = definePlugin({
    id: "card-quick-search",
    name: "Card Quick Search",
    description: "Press a hotkey on any page to search every card by name, alias, tribe, trait or ability text - with owned counts.",
    authors: ["Keira"],
    tags: ["cards", "search"],
    defaultEnabled: true,
    options: {
      hotkey: {
        type: "select",
        label: "Hotkey",
        default: "ctrl-k",
        choices: Object.entries(HOTKEYS).map(([value, h]) => ({ value, label: h.label }))
      },
      showOwned: {
        type: "boolean",
        label: "Show how many copies I own",
        default: true
      },
      maxResults: {
        type: "number",
        label: "Max results",
        default: 25,
        min: 5,
        max: 100
      }
    },
    async init(ctx) {
      const { api, options, log: log2 } = ctx;
      if (!document.getElementById(STYLE_ID3)) {
        const style = document.createElement("style");
        style.id = STYLE_ID3;
        style.textContent = STYLES4;
        document.head.appendChild(style);
      }
      let index = null;
      let indexPromise = null;
      let owned = null;
      let results = [];
      let selected = 0;
      const expanded = /* @__PURE__ */ new Set();
      const input = document.createElement("input");
      input.type = "search";
      input.placeholder = "Search cards, abilities, tribes, traits\u2026";
      const hint = document.createElement("div");
      hint.className = "gh-cqs-hint gh-muted";
      const list = document.createElement("div");
      list.className = "gh-cqs-list";
      const modal = createModal({
        id: "card-quick-search",
        title: "Card Search",
        width: 620,
        onOpen: () => {
          input.focus();
          input.select();
        }
      });
      modal.body.append(input, hint, list);
      function loadIndex() {
        if (!indexPromise) {
          indexPromise = api.getAllCardInfo().then((cards) => {
            index = indexCards(cards);
            render();
          }).catch((err) => {
            indexPromise = null;
            hint.textContent = `Couldn't load cards: ${err.message}`;
            throw err;
          });
        }
        return indexPromise;
      }
      async function loadOwned() {
        if (!options.get("showOwned")) return;
        try {
          const res = await api.getMyCards();
          owned = new Map((res.cards || []).map((c) => [normName(c.card_name), c.quantity]));
        } catch {
          owned = null;
        }
        if (modal.isOpen()) render();
      }
      function ownedPill(card) {
        if (!options.get("showOwned") || !owned) return null;
        if (/hero|token/i.test(card.rarity) || /superpower/i.test(card.tribe)) return null;
        const n = owned.get(card.key) || 0;
        const pill = document.createElement("span");
        pill.className = `gh-pill ${n >= 4 ? "gh-pill-ok" : n > 0 ? "gh-pill-warn" : "gh-pill-bad"}`;
        pill.textContent = n >= 4 ? `owned ${n}` : `owned ${n}/4`;
        return pill;
      }
      function rowFor(card, i) {
        const row = document.createElement("div");
        row.className = "gh-cqs-row";
        row.setAttribute("aria-selected", String(i === selected));
        row.setAttribute("aria-expanded", String(expanded.has(card.key)));
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = "";
        img.src = card.thumb;
        img.onerror = () => img.remove();
        const main = document.createElement("div");
        main.className = "gh-cqs-main";
        const top = document.createElement("div");
        top.className = "gh-cqs-top";
        const name = document.createElement("span");
        name.className = "gh-cqs-name";
        name.textContent = card.name;
        const stats2 = document.createElement("span");
        stats2.className = "gh-cqs-stats";
        stats2.textContent = statLine(card.stats);
        top.append(name, stats2);
        const pill = ownedPill(card);
        if (pill) top.appendChild(pill);
        const sub = document.createElement("div");
        sub.className = "gh-cqs-sub gh-muted";
        sub.textContent = [card.side, card.cls, card.tribe, card.rarity, card.traits].filter(Boolean).join(" \xB7 ");
        const ability = document.createElement("div");
        ability.className = "gh-cqs-ability";
        ability.textContent = card.ability;
        const flavor = document.createElement("div");
        flavor.className = "gh-cqs-flavor gh-muted";
        flavor.textContent = card.flavor;
        const copyBtn = document.createElement("button");
        copyBtn.className = "gh-cqs-copy";
        copyBtn.textContent = "Copy name";
        copyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(card.name).then(
            () => copyBtn.textContent = "Copied!",
            () => copyBtn.textContent = "Copy failed"
          );
        });
        main.append(top, sub);
        if (card.ability) main.appendChild(ability);
        if (card.flavor) main.appendChild(flavor);
        main.appendChild(copyBtn);
        row.append(img, main);
        row.addEventListener("click", () => {
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
        list.textContent = "";
        if (!index) {
          hint.textContent = "Loading card database\u2026";
          return;
        }
        const q = input.value;
        results = search(index, q, options.get("maxResults"));
        if (selected >= results.length) selected = Math.max(0, results.length - 1);
        const hk = HOTKEYS[options.get("hotkey")]?.label || "Ctrl+K";
        if (!q.trim()) {
          hint.textContent = `${index.length} cards. Type to search \xB7 \u2191\u2193 to move \xB7 Enter to expand \xB7 ${hk} toggles \xB7 Esc closes`;
        } else {
          hint.textContent = results.length ? `${results.length} match${results.length === 1 ? "" : "es"}` : "No matches.";
        }
        results.forEach((card, i) => list.appendChild(rowFor(card, i)));
        list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
      }
      input.addEventListener("input", () => {
        selected = 0;
        render();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (!results.length) return;
          selected = (selected + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
          render();
        } else if (e.key === "Enter" && results[selected]) {
          e.preventDefault();
          toggleExpanded(results[selected]);
        }
      });
      function openSearch() {
        modal.open();
        render();
        loadIndex().catch((err) => log2(`failed to load cardinfo: ${err.message}`, "error"));
        if (owned === null) loadOwned();
      }
      function onKeyDown(e) {
        const hotkey = HOTKEYS[options.get("hotkey")] || HOTKEYS["ctrl-k"];
        if (!hotkey.test(e)) return;
        if (hotkey.skipInInputs && isTypingTarget(e.target) && !modal.isOpen()) return;
        e.preventDefault();
        e.stopPropagation();
        if (modal.isOpen()) modal.close();
        else openSearch();
      }
      document.addEventListener("keydown", onKeyDown, true);
      const offCollection = onCollectionChanged(() => {
        owned = null;
        if (modal.isOpen()) loadOwned();
      });
      const offOpt = options.onChange((key) => {
        if (key === "showOwned" && options.get("showOwned") && owned === null) loadOwned();
        if (modal.isOpen()) render();
      });
      return () => {
        document.removeEventListener("keydown", onKeyDown, true);
        offCollection();
        offOpt();
        modal.destroy();
      };
    }
  });

  // src/plugins/crash-handler/index.js
  var STATE_KEY = "crashHandler";
  var MAX_LOG = 25;
  function readState(settings) {
    return { pending: null, failStreak: {}, log: [], ...settings.get(STATE_KEY, {}) || {} };
  }
  function writeState(settings, state) {
    settings.set(STATE_KEY, state);
  }
  function pushLog(state, entry) {
    state.log = [entry, ...state.log || []].slice(0, MAX_LOG);
  }
  function formatReport(entry) {
    return [
      `${BRAND.name} crash report`,
      `plugin: ${entry.id}`,
      `phase: ${entry.phase}`,
      `when: ${entry.at}`,
      `page: ${entry.page}`,
      `build: ${entry.build}`,
      `error: ${entry.message}`,
      "",
      entry.stack || "(no stack)"
    ].join("\n");
  }
  function copy(text) {
    try {
      navigator.clipboard?.writeText(text);
    } catch {
    }
    console.info(text);
  }
  var crash_handler_default = definePlugin({
    id: "crash-handler",
    name: "Crash Handler",
    description: "Catches plugin crashes, tells you about them, and auto-disables a plugin that keeps failing or freezes the page.",
    required: true,
    defaultEnabled: true,
    priority: 100,
    tags: ["core"],
    options: {
      autoDisable: {
        type: "boolean",
        label: "Auto-disable crashing plugins",
        description: "Turn a plugin off after it fails to start several page loads in a row.",
        default: true
      },
      threshold: {
        type: "number",
        label: "Failures before auto-disable",
        default: 2,
        min: 1,
        max: 10
      },
      showToasts: {
        type: "boolean",
        label: "Show crash notifications",
        default: true
      }
    },
    async init(ctx) {
      const { settings, plugins, options, log: log2 } = ctx;
      const build = typeof __PVZHTBOT_MOD_BUILD_ID__ !== "undefined" ? __PVZHTBOT_MOD_BUILD_ID__ : "unknown";
      const state = readState(settings);
      if (state.pending && state.pending !== "crash-handler") {
        const culprit = state.pending;
        const info = plugins.list().find((p) => p.id === culprit);
        const entry = {
          id: culprit,
          phase: "freeze",
          message: "The page froze or closed while this plugin was starting.",
          stack: "",
          at: (/* @__PURE__ */ new Date()).toISOString(),
          page: location.pathname,
          build
        };
        pushLog(state, entry);
        state.pending = null;
        state.failStreak[culprit] = (state.failStreak[culprit] || 0) + 1;
        const shouldDisable = info && !info.required && options.get("autoDisable") && state.failStreak[culprit] >= options.get("threshold");
        if (shouldDisable) delete state.failStreak[culprit];
        writeState(settings, state);
        if (shouldDisable) {
          plugins.setEnabled(culprit, false).catch(() => {
          });
          showToast({
            kind: "error",
            title: `${info.name} was disabled`,
            body: "It froze or crashed the page while starting, more than once. Re-enable it from settings once it's fixed.",
            timeoutMs: 0,
            actions: [
              { label: "Copy details", onClick: () => copy(formatReport(entry)) },
              { label: "Re-enable", onClick: () => plugins.setEnabled(culprit, true) }
            ]
          });
        }
      } else if (state.pending) {
        state.pending = null;
        writeState(settings, state);
      }
      const offs = [];
      const onPageHide = () => {
        const s = readState(settings);
        if (s.pending) {
          s.pending = null;
          writeState(settings, s);
        }
      };
      window.addEventListener("pagehide", onPageHide);
      offs.push(() => window.removeEventListener("pagehide", onPageHide));
      offs.push(
        plugins.on("plugin:starting", ({ id }) => {
          const s = readState(settings);
          s.pending = id;
          writeState(settings, s);
        })
      );
      offs.push(
        plugins.on("plugin:started", ({ id }) => {
          const s = readState(settings);
          if (s.pending === id) s.pending = null;
          if (s.failStreak[id]) delete s.failStreak[id];
          writeState(settings, s);
        })
      );
      offs.push(
        plugins.on("plugin:error", ({ id, phase, error }) => {
          const s = readState(settings);
          if (s.pending === id) s.pending = null;
          const entry = {
            id,
            phase,
            message: error?.message || String(error),
            stack: error?.stack || "",
            at: (/* @__PURE__ */ new Date()).toISOString(),
            page: location.pathname,
            build
          };
          pushLog(s, entry);
          let disabled = false;
          if (phase === "init") {
            s.failStreak[id] = (s.failStreak[id] || 0) + 1;
            const info = plugins.list().find((p) => p.id === id);
            if (options.get("autoDisable") && !info?.required && s.failStreak[id] >= options.get("threshold")) {
              delete s.failStreak[id];
              disabled = true;
            }
          }
          writeState(settings, s);
          if (disabled) {
            plugins.setEnabled(id, false).catch(() => {
            });
            log2(`auto-disabled ${id} after repeated startup failures`, "error");
          }
          if (options.get("showToasts")) {
            const name = plugins.list().find((p) => p.id === id)?.name || id;
            showToast({
              kind: "error",
              title: disabled ? `${name} crashed and was disabled` : `${name} crashed`,
              body: `${phase}: ${entry.message}`,
              timeoutMs: disabled ? 0 : 1e4,
              actions: [
                { label: "Copy details", onClick: () => copy(formatReport(entry)) },
                ...disabled ? [{ label: "Re-enable", onClick: () => plugins.setEnabled(id, true) }] : []
              ]
            });
          }
        })
      );
      const api = {
        crashLog: () => readState(settings).log,
        clearCrashLog: () => {
          const s = readState(settings);
          s.log = [];
          s.failStreak = {};
          writeState(settings, s);
        }
      };
      const pageWindow3 = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
      pageWindow3.__greenhouse = { ...pageWindow3.__greenhouse || {}, ...api };
      return () => offs.forEach((off) => off());
    }
  });

  // src/plugins/deck-buildability/index.js
  var MARKER_ATTR = "data-pvzhtbot-deck-buildability-card";
  var STYLE_ID4 = "pvzhtbot-deck-buildability-styles";
  var PANEL_ID2 = "pvzhtbot-deck-buildability-panel";
  var BACKDROP_ID2 = "pvzhtbot-deck-buildability-backdrop";
  var GRID_SELECTOR2 = ".user-dashboard-grid";
  var STYLES5 = `
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
  function injectStylesOnce2() {
    if (document.getElementById(STYLE_ID4)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID4;
    style.textContent = STYLES5;
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
    injectStylesOnce2();
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
  var deckBuildabilityPlugin = definePlugin({
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
        card.setAttribute(MARKER_ATTR, "true");
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
        if (grid.querySelector(`[${MARKER_ATTR}]`)) return;
        grid.appendChild(buildCard2());
      }
      tryInject();
      const observer = new MutationObserver(() => tryInject());
      observer.observe(document.body, { childList: true, subtree: true });
      return () => {
        observer.disconnect();
        document.querySelector(`[${MARKER_ATTR}]`)?.remove();
      };
    }
  });
  var deck_buildability_default = deckBuildabilityPlugin;

  // src/plugins/hero-reference/index.js
  var MARKER_ATTR2 = "data-pvzhtbot-hero-reference-card";
  var STYLE_ID5 = "pvzhtbot-hero-reference-styles";
  var PANEL_ID3 = "pvzhtbot-hero-reference-panel";
  var BACKDROP_ID3 = "pvzhtbot-hero-reference-backdrop";
  var GRID_SELECTOR3 = ".user-dashboard-grid";
  var STYLES6 = `
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
  function injectStylesOnce3() {
    if (document.getElementById(STYLE_ID5)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID5;
    style.textContent = STYLES6;
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
    injectStylesOnce3();
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
  var heroReferencePlugin = definePlugin({
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
        card.setAttribute(MARKER_ATTR2, "true");
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
  });
  var hero_reference_default = heroReferencePlugin;

  // src/plugins/keep-or-scrap-advisor/index.js
  var TIERS = [
    { key: "craft", label: "Craft", group: "Craft", hint: "So good they should be crafted." },
    { key: "use", label: "Use", group: "Keep", hint: "Keep - most useful alongside lower-rarity cards." },
    { key: "hold", label: "Hold for later", group: "Keep", hint: "Keep - best with other high-rarity cards." },
    { key: "usable", label: "Usable", group: "Scrappable", hint: "Fine on a budget, loses value as your collection grows." },
    { key: "niche", label: "Niche", group: "Scrappable", hint: "Great in specific strategies, weak elsewhere." }
  ];
  var HEADING_TO_TIER = { craft: "craft", use: "use", hold: "hold", keep: "hold", usable: "usable", niche: "niche" };
  var STYLE_ID6 = "greenhouse-kos-styles";
  var STYLES7 = `
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
  function parseGuide(reasoning) {
    const picks = [];
    const seen = /* @__PURE__ */ new Set();
    let tier = null;
    for (const rawLine of String(reasoning || "").replace(/\r/g, "").split("\n")) {
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
      api.getMyCards().catch(() => null)
    ]);
    const matchCard = createCardMatcher(cardinfo);
    const owned = mine ? new Map((mine.cards || []).map((c) => [normName(c.card_name), c.quantity])) : null;
    const classes = guide.filter((e) => e.card_class && e.card_class !== "NULL" && !/intro/i.test(e.side)).map((e) => {
      const picks = parseGuide(e.reasoning).map((p) => {
        const card = matchCard(p.name);
        return {
          ...p,
          known: Boolean(card),
          displayName: card?.card_name || p.name,
          qty: owned && card ? owned.get(normName(card.card_name)) || 0 : null
        };
      });
      return { side: e.side, cls: e.card_class, creator: cleanEmoji(e.creator), picks };
    });
    return { classes, loggedIn: Boolean(owned) };
  }
  var keep_or_scrap_advisor_default = definePlugin({
    id: "keep-or-scrap-advisor",
    name: "Keep or Scrap Advisor",
    description: "Cross-checks the site's Keep or Scrap guide against your collection: which recommended cards (especially Craft picks) you're still missing.",
    authors: ["Keira"],
    tags: ["cards", "collection", "guides"],
    defaultEnabled: true,
    options: {
      onlyMissing: {
        type: "boolean",
        label: `Start with "only cards I'm missing" on`,
        default: false
      }
    },
    async init(ctx) {
      const { api, options, log: log2 } = ctx;
      if (!document.getElementById(STYLE_ID6)) {
        const style = document.createElement("style");
        style.id = STYLE_ID6;
        style.textContent = STYLES7;
        document.head.appendChild(style);
      }
      let data = null;
      let loading = null;
      let sideFilter = "All";
      let onlyMissing = options.get("onlyMissing");
      const modal = createModal({ id: "keep-or-scrap", title: "Keep or Scrap Advisor", width: 720 });
      function chipClass(p) {
        if (!p.known) return "unknown";
        if (p.qty === null) return "";
        return p.qty >= 4 ? "have" : p.qty > 0 ? "some" : "none";
      }
      function render() {
        const body = modal.body;
        body.textContent = "";
        if (!data) {
          body.appendChild(Object.assign(document.createElement("div"), { className: "gh-muted", textContent: "Loading guide and your collection\u2026" }));
          return;
        }
        const all = data.classes.flatMap((c) => c.picks.filter((p) => p.known));
        const craft = all.filter((p) => p.tier === "craft");
        const craftMissing = craft.filter((p) => p.qty !== null && p.qty < 4);
        const keepMissing = all.filter((p) => (p.tier === "use" || p.tier === "hold") && p.qty !== null && p.qty < 4);
        const summary = document.createElement("div");
        summary.className = "gh-kos-summary";
        const stat = (value, label) => {
          const s = document.createElement("div");
          s.className = "gh-kos-stat";
          const b = document.createElement("b");
          b.textContent = value;
          s.append(b, document.createTextNode(label));
          return s;
        };
        if (data.loggedIn) {
          summary.append(
            stat(`${craft.length - craftMissing.length}/${craft.length}`, "Craft picks at 4x"),
            stat(String(craftMissing.length), "Craft picks to get"),
            stat(String(keepMissing.length), "Keep picks under 4x")
          );
        } else {
          summary.append(stat("\u2013", "Log in to compare with your collection"));
        }
        body.appendChild(summary);
        const controls = document.createElement("div");
        controls.className = "gh-kos-controls";
        const tabs = document.createElement("div");
        tabs.className = "gh-tabs";
        for (const side of ["All", "Plants", "Zombies"]) {
          const b = document.createElement("button");
          b.textContent = side;
          b.setAttribute("aria-pressed", String(sideFilter === side));
          b.addEventListener("click", () => {
            sideFilter = side;
            render();
          });
          tabs.appendChild(b);
        }
        const toggle = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = onlyMissing;
        cb.disabled = !data.loggedIn;
        cb.addEventListener("change", () => {
          onlyMissing = cb.checked;
          render();
        });
        toggle.append(cb, document.createTextNode("Only cards I'm missing"));
        controls.append(tabs, toggle);
        body.appendChild(controls);
        let shown = 0;
        for (const c of data.classes) {
          if (sideFilter !== "All" && c.side !== sideFilter) continue;
          const box = document.createElement("div");
          box.className = "gh-kos-class";
          const head = document.createElement("div");
          head.className = "gh-kos-class-head";
          const h = document.createElement("h4");
          h.textContent = `${c.cls}`;
          const sideEl = document.createElement("span");
          sideEl.className = "gh-muted";
          sideEl.style.fontSize = "11px";
          sideEl.textContent = c.side;
          head.append(h, sideEl);
          box.appendChild(head);
          let classHasRows = false;
          for (const tier of TIERS) {
            let picks = c.picks.filter((p) => p.tier === tier.key);
            if (onlyMissing && data.loggedIn) picks = picks.filter((p) => p.known && p.qty < 4);
            if (!picks.length) continue;
            classHasRows = true;
            const row = document.createElement("div");
            row.className = "gh-kos-tier";
            const label = document.createElement("div");
            label.className = `gh-kos-tier-label gh-muted ${tier.key}`;
            label.textContent = tier.label;
            label.title = `${tier.group}: ${tier.hint}`;
            const chips = document.createElement("div");
            chips.className = "gh-kos-chips";
            for (const p of picks) {
              const chip = document.createElement("span");
              chip.className = `gh-kos-chip ${chipClass(p)}`;
              chip.textContent = p.qty === null || !p.known ? p.displayName : `${p.displayName} ${Math.min(p.qty, 4)}/4`;
              chip.title = p.known ? p.note : `${p.note}

(Not found in the card database by this exact name.)`;
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
          body.appendChild(Object.assign(document.createElement("div"), { className: "gh-muted", textContent: onlyMissing ? "Nothing missing here - you have every pick at 4x. \u{1F331}" : "No guide data." }));
        }
        const foot = document.createElement("div");
        foot.className = "gh-kos-foot gh-muted";
        foot.textContent = "Shows the cards the guide highlights in its written notes, not every card in each tier (the full list is only in the guide image on /keeporscrap). Hover a card for the guide's note.";
        body.appendChild(foot);
      }
      function load(force = false) {
        if (loading && !force) return loading;
        loading = loadData(api).then((d) => {
          data = d;
          if (modal.isOpen()) render();
        }).catch((err) => {
          loading = null;
          log2(`failed to load: ${err.message}`, "error");
          modal.body.textContent = `Couldn't load the guide: ${err.message}`;
        });
        return loading;
      }
      function open() {
        onlyMissing = options.get("onlyMissing");
        modal.open();
        render();
        load();
      }
      const removeTile = addDashboardTile({ id: "keep-or-scrap-advisor", label: "Keep or Scrap Advisor", action: "Check \u2192", onClick: open });
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
    }
  });

  // src/plugins/update-checker/index.js
  var BUILD_ID_URL = define_GREENHOUSE_URLS_default.buildId;
  var INSTALL_URL = define_GREENHOUSE_URLS_default.install;
  var DEV_SERVER_BUILD_ID_URL = `${define_GREENHOUSE_URLS_default.devServer}/build-id`;
  var CHECK_INTERVAL_MS = 60 * 60 * 1e3;
  var DISMISSED_KEY_PREFIX = "pvzhtbot-mod-update-dismissed-";
  var BANNER_ID = "pvzhtbot-update-banner";
  var STYLE_ID7 = "pvzhtbot-update-banner-styles";
  var STYLES8 = `
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
  function injectStylesOnce4() {
    if (document.getElementById(STYLE_ID7)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID7;
    style.textContent = STYLES8;
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
    injectStylesOnce4();
    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    const title = document.createElement("div");
    title.className = "pvzhtbot-update-title";
    title.textContent = `${BRAND.name} update available`;
    banner.appendChild(title);
    const body = document.createElement("div");
    body.className = "pvzhtbot-update-body";
    body.textContent = `A newer version is out. "Update now" opens Tampermonkey's update screen - click Update there, then refresh this page.`;
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
    viewBtn.textContent = "Update now";
    viewBtn.addEventListener("click", () => {
      window.open(INSTALL_URL, "_blank", "noopener,noreferrer");
    });
    actions.appendChild(dismissBtn);
    actions.appendChild(viewBtn);
    banner.appendChild(actions);
    document.body.appendChild(banner);
    log2("showing update banner");
  }
  function wasDismissed(buildId) {
    try {
      return sessionStorage.getItem(`${DISMISSED_KEY_PREFIX}${buildId}`) === "1";
    } catch {
      return false;
    }
  }
  async function checkOnce(context) {
    if (false) {
      document.getElementById(BANNER_ID)?.remove();
      return;
    }
    const running = currentBuildId();
    if (!running) return;
    try {
      const latest = await fetchLatestBuildId();
      const latestN = Number(latest);
      const runningN = Number(running);
      const isNewer = Number.isFinite(latestN) && Number.isFinite(runningN) && latestN > runningN;
      if (isNewer && !wasDismissed(latest)) {
        showBanner(latest, context.log);
      } else if (!isNewer) {
        document.getElementById(BANNER_ID)?.remove();
      }
    } catch (err) {
      context.log(`check failed: ${err.message}`, "error");
    }
  }
  var updateCheckerPlugin = definePlugin({
    id: "update-checker",
    name: "Update Checker",
    description: "Checks GitHub for a newer build and shows a dashboard notice if this install is out of date. Always on (skipped automatically while running via the local dev server).",
    defaultEnabled: true,
    required: true,
    async init(context) {
      checkOnce(context);
      const intervalId = setInterval(() => checkOnce(context), CHECK_INTERVAL_MS);
      return () => {
        clearInterval(intervalId);
        document.getElementById(BANNER_ID)?.remove();
      };
    }
  });
  var update_checker_default = updateCheckerPlugin;

  // greenhouse-virtual:greenhouse:plugins
  var greenhouse_plugins_default = [
    { plugin: analytics_blocker_default, folder: "analytics-blocker", builtIn: true },
    { plugin: api_cache_default, folder: "api-cache", builtIn: true },
    { plugin: card_quick_search_default, folder: "card-quick-search", builtIn: true },
    { plugin: crash_handler_default, folder: "crash-handler", builtIn: true },
    { plugin: deck_buildability_default, folder: "deck-buildability", builtIn: true },
    { plugin: hero_reference_default, folder: "hero-reference", builtIn: true },
    { plugin: keep_or_scrap_advisor_default, folder: "keep-or-scrap-advisor", builtIn: true },
    { plugin: update_checker_default, folder: "update-checker", builtIn: true }
  ];

  // src/core/loader.js
  var LOADED_ATTR = "data-greenhouse-loaded";
  function log(message, level = "info") {
    const fn = level === "error" ? console.error : console.log;
    fn(`${BRAND.logPrefix} ${message}`);
  }
  function whenDomReady() {
    if (document.readyState !== "loading") return Promise.resolve();
    return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }
  async function boot() {
    const settings = new SettingsStore();
    const api = new PvzhtbotApi();
    const backend = new BackendClient({ baseUrl: settings.get("backendUrl", null) });
    let devModeDetected = false;
    const context = { api, backend, settings, log, isDevMode: () => devModeDetected };
    const pluginManager = new PluginManager({ settings, context });
    for (const { plugin, folder, builtIn } of greenhouse_plugins_default) {
      try {
        pluginManager.register(plugin, { folder, builtIn });
      } catch (err) {
        log(`could not register plugin from folder "${folder}": ${err.message}`, "error");
      }
    }
    pluginManager.runEarlyHooks();
    await whenDomReady();
    const panel = createSettingsPanel(pluginManager);
    mountDashboardCard(() => panel.open());
    await pluginManager.startEnabledPlugins();
    if (false) {
      startDevReloadWatcher(log, () => {
        devModeDetected = true;
      });
    }
    log(`ready - ${pluginManager.list().filter((p) => p.active).length} plugin(s) running`);
    warnIfLegacyScriptRunning();
    return { api, backend, settings, pluginManager };
  }
  var LEGACY_PANEL_ID = "pvzhtbot-mod-settings-panel";
  function warnIfLegacyScriptRunning() {
    setTimeout(() => {
      if (!document.getElementById(LEGACY_PANEL_ID)) return;
      log('the old "PvZHTBot Mod" script is also running - delete it in Tampermonkey', "error");
      let dismissed = false;
      try {
        dismissed = sessionStorage.getItem("greenhouse-legacy-warned") === "1";
      } catch {
      }
      if (dismissed) return;
      showToast({
        kind: "warn",
        title: 'Old "PvZHTBot Mod" is still installed',
        body: `${BRAND.name} replaced it, but Tampermonkey kept the old script because it was renamed. Both are running, which causes stale notices and duplicate/missing cards.

Open the Tampermonkey dashboard and delete "PvZHTBot Mod" (keep "Greenhouse").`,
        timeoutMs: 0,
        actions: [
          {
            label: "Got it",
            onClick: () => {
              try {
                sessionStorage.setItem("greenhouse-legacy-warned", "1");
              } catch {
              }
            }
          }
        ]
      });
    }, 3e3);
  }
  var pageWindow2 = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  if (document.documentElement.hasAttribute(LOADED_ATTR)) {
    log(
      `another copy (${document.documentElement.getAttribute(LOADED_ATTR)}) already loaded on this page - skipping. Disable either the installed script or the dev loader in Tampermonkey.`,
      "error"
    );
  } else {
    const buildId = typeof __PVZHTBOT_MOD_BUILD_ID__ !== "undefined" ? __PVZHTBOT_MOD_BUILD_ID__ : "unknown";
    document.documentElement.setAttribute(LOADED_ATTR, `build ${buildId}`);
    const booted = boot();
    pageWindow2.__greenhouse = { ...pageWindow2.__greenhouse || {}, boot: booted, buildId };
  }
})();
