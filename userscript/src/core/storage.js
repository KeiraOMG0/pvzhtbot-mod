// Persistent settings storage, backed by Tampermonkey's GM_getValue /
// GM_setValue when available (survives across page loads and domains,
// unlike localStorage which is per-origin), falling back to localStorage
// for local dev/testing outside of Tampermonkey.

const STORAGE_KEY = 'pvzhtbot_mod_settings_v1';

function hasGM() {
  return typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
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
    // best-effort; ignore quota/availability errors in fallback mode
  }
}

class SettingsStore {
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
    const plugins = this.get('plugins', {});
    return pluginId in plugins ? Boolean(plugins[pluginId]) : defaultEnabled;
  }

  setPluginEnabled(pluginId, enabled) {
    const plugins = this.get('plugins', {});
    plugins[pluginId] = Boolean(enabled);
    this.set('plugins', plugins);
  }
}

export { SettingsStore };
