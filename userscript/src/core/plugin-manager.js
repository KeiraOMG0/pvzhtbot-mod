// Plugin manager: registers plugins, tracks enabled/disabled state (via
// SettingsStore), and drives their lifecycle.
//
// A plugin is a plain object:
//   {
//     id: 'unique-kebab-case-id',
//     name: 'Human-readable name',
//     description: 'One line, shown in the settings panel.',
//     defaultEnabled: false,
//     required: false,             // optional: true = always on, cannot
//                                   // be disabled, no checkbox in settings
//                                   // (see src/plugins/update-checker/)
//     init(context): called once when the plugin is enabled (page load
//       if already enabled, or immediately on toggle-on). May return a
//       teardown function.
//     teardown?: optional explicit teardown, called on toggle-off instead
//       of / in addition to whatever init() returned.
//   }
//
// `context` passed to init() is { api, backend, settings, log }.

class PluginManager {
  constructor({ settings, context }) {
    this.settings = settings;
    this.context = context;
    this._plugins = new Map(); // id -> plugin definition
    this._teardowns = new Map(); // id -> teardown fn or undefined
    this._active = new Set();
  }

  register(plugin) {
    if (!plugin || !plugin.id) {
      throw new Error('Plugin must have a unique `id`');
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
      description: p.description || '',
      enabled: this.isEnabled(p.id),
      active: this._active.has(p.id),
      required: Boolean(p.required),
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
      this._teardowns.set(pluginId, typeof teardown === 'function' ? teardown : plugin.teardown);
      this._active.add(pluginId);
      this.context.log(`[plugin:${pluginId}] activated`);
    } catch (err) {
      this.context.log(`[plugin:${pluginId}] failed to activate: ${err.message}`, 'error');
    }
  }

  _deactivate(pluginId) {
    const teardown = this._teardowns.get(pluginId);
    try {
      if (typeof teardown === 'function') teardown();
    } catch (err) {
      this.context.log(`[plugin:${pluginId}] error during teardown: ${err.message}`, 'error');
    }
    this._teardowns.delete(pluginId);
    this._active.delete(pluginId);
    this.context.log(`[plugin:${pluginId}] deactivated`);
  }
}

export { PluginManager };
