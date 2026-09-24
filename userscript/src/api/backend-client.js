// Thin seam for a future self-hosted backend (e.g. an "idlesys" Node
// service) that some plugin might eventually need for server-side state
// (cross-device sync, scheduled jobs, etc).
//
// Nothing calls this yet. No plugin should depend on it until a concrete
// feature actually needs server-side state that pvzhtbot.com's own API
// can't provide. Keeping it here (rather than inventing it later) just
// means a plugin's `context.backend` is always defined, even if disabled,
// so a future plugin doesn't have to special-case "backend not configured".

class BackendClient {
  constructor({ baseUrl = null } = {}) {
    this.baseUrl = baseUrl;
    this.enabled = Boolean(baseUrl);
  }

  async _request(path, options = {}) {
    if (!this.enabled) {
      throw new Error(
        `BackendClient is not configured (no baseUrl set) — cannot call ${path}. ` +
          'Set a backend URL in the mod settings before using backend-dependent features.'
      );
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Backend request to ${path} failed with ${res.status}`);
    }
    return res.json();
  }

  get(path) {
    return this._request(path, { method: 'GET' });
  }

  post(path, body) {
    return this._request(path, { method: 'POST', body: JSON.stringify(body) });
  }
}

export { BackendClient };
