// Plugin manager: registers plugins (declared with definePlugin(), see
// define-plugin.js), tracks enabled/disabled state and per-plugin
// options (via SettingsStore), resolves dependencies, and drives
// lifecycle. Every call into plugin code is isolated: a plugin throwing
// in init/teardown/an option listener never takes down the loader or
// any other plugin - the error is recorded and emitted as a
// `plugin:error` event instead (crash-handler listens for those).
//
// Events (manager.on(name, cb) -> unsubscribe):
//   plugin:starting { id }
//   plugin:started  { id }
//   plugin:stopped  { id }
//   plugin:error    { id, phase: 'early'|'init'|'teardown'|'option-listener', error }
//   option:changed  { id, key, value, restartNeeded }

class PluginManager {
  constructor({ settings, context }) {
    this.settings = settings;
    this.baseContext = context;
    this._plugins = new Map(); // id -> plugin definition
    this._meta = new Map(); // id -> { folder, builtIn }
    this._teardowns = new Map(); // id -> teardown fn or undefined
    this._active = new Set();
    this._errors = new Map(); // id -> last { phase, message, stack, at }
    this._optionListeners = new Map(); // id -> Set<fn>
    this._eventListeners = new Map(); // event -> Set<fn>
  }

  // ---- events ----
  on(event, cb) {
    if (!this._eventListeners.has(event)) this._eventListeners.set(event, new Set());
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
      throw new Error('Plugin must have a unique `id`');
    }
    if (this._plugins.has(plugin.id)) {
      throw new Error(`Plugin id "${plugin.id}" is already registered`);
    }
    if (meta.folder && meta.folder !== plugin.id) {
      this.baseContext.log(
        `plugin folder "${meta.folder}" declares id "${plugin.id}" - keep them the same to avoid confusion`,
        'error'
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
    return [...this._plugins.values()]
      .map((p) => ({
        id: p.id,
        name: p.name || p.id,
        description: p.description || '',
        authors: p.authors || [],
        tags: p.tags || [],
        dependencies: p.dependencies || [],
        options: p.options || {},
        enabled: this.isEnabled(p.id),
        active: this._active.has(p.id),
        required: Boolean(p.required),
        builtIn: this._meta.get(p.id)?.builtIn !== false,
        lastError: this._errors.get(p.id) || null,
      }))
      .sort(
        (a, b) =>
          Number(b.required) - Number(a.required) ||
          Number(b.builtIn) - Number(a.builtIn) ||
          a.name.localeCompare(b.name)
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
    return this.settings.getPluginOption(pluginId, key, schema ? schema.default : undefined);
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
        this._recordError(pluginId, 'option-listener', err);
      }
    }
    this._emit('option:changed', { id: pluginId, key, value: coerced, restartNeeded: Boolean(schema.restartNeeded) });
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
          this._recordError(pluginId, 'option-listener', err);
        }
      }
    }
  }

  _optionsApi(pluginId) {
    const manager = this;
    const store = new Proxy(
      {},
      {
        get: (_, key) => (typeof key === 'string' ? manager.getOption(pluginId, key) : undefined),
        set: (_, key, value) => {
          manager.setOption(pluginId, key, value);
          return true;
        },
      }
    );
    return {
      get: (key) => manager.getOption(pluginId, key),
      set: (key, value) => manager.setOption(pluginId, key, value),
      store,
      onChange(cb) {
        if (!manager._optionListeners.has(pluginId)) manager._optionListeners.set(pluginId, new Set());
        manager._optionListeners.get(pluginId).add(cb);
        return () => manager._optionListeners.get(pluginId)?.delete(cb);
      },
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
      on: (event, cb) => this.on(event, cb),
    };
  }

  _contextFor(pluginId) {
    const baseLog = this.baseContext.log;
    return {
      ...this.baseContext,
      log: (message, level) => baseLog(`[plugin:${pluginId}] ${message}`, level),
      options: this._optionsApi(pluginId),
      plugins: this._pluginsApi(),
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
      if (typeof plugin.earlyInit !== 'function' || !this.isEnabled(plugin.id)) continue;
      try {
        plugin.earlyInit(this._contextFor(plugin.id));
      } catch (err) {
        this._recordError(plugin.id, 'early', err);
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
      // Turning a plugin on turns its dependencies on too.
      for (const depId of plugin.dependencies || []) {
        if (!this._plugins.has(depId)) {
          this.baseContext.log(`[plugin:${pluginId}] missing dependency "${depId}"`, 'error');
        } else if (!this.isEnabled(depId) || !this._active.has(depId)) {
          await this.setEnabled(depId, true);
        }
      }
      if (!this._active.has(pluginId)) await this._activate(pluginId);
    } else {
      // Turning a plugin off turns off anything that depends on it.
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

    this._emit('plugin:starting', { id: pluginId });
    try {
      const teardown = await plugin.init(this._contextFor(pluginId));
      this._teardowns.set(pluginId, typeof teardown === 'function' ? teardown : plugin.teardown);
      this._active.add(pluginId);
      this._errors.delete(pluginId);
      this.baseContext.log(`[plugin:${pluginId}] activated`);
      this._emit('plugin:started', { id: pluginId });
      return true;
    } catch (err) {
      this._recordError(pluginId, 'init', err);
      return false;
    }
  }

  _deactivate(pluginId) {
    const teardown = this._teardowns.get(pluginId);
    try {
      if (typeof teardown === 'function') teardown();
    } catch (err) {
      this._recordError(pluginId, 'teardown', err);
    }
    this._teardowns.delete(pluginId);
    this._active.delete(pluginId);
    this._optionListeners.delete(pluginId);
    this.baseContext.log(`[plugin:${pluginId}] deactivated`);
    this._emit('plugin:stopped', { id: pluginId });
  }

  _recordError(pluginId, phase, err) {
    const error = err instanceof Error ? err : new Error(String(err));
    this._errors.set(pluginId, {
      phase,
      message: error.message,
      stack: error.stack || '',
      at: new Date().toISOString(),
    });
    this.baseContext.log(`[plugin:${pluginId}] ${phase} failed: ${error.message}`, 'error');
    this._emit('plugin:error', { id: pluginId, phase, error });
  }
}

function coerceOption(schema, value) {
  switch (schema.type) {
    case 'boolean':
      return Boolean(value);
    case 'number': {
      let n = Number(value);
      if (!Number.isFinite(n)) n = schema.default;
      if (typeof schema.min === 'number') n = Math.max(schema.min, n);
      if (typeof schema.max === 'number') n = Math.min(schema.max, n);
      return n;
    }
    case 'select':
      return schema.choices.some((c) => c.value === value) ? value : schema.default;
    default:
      return value == null ? '' : String(value);
  }
}

export { PluginManager };
