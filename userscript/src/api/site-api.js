// Site API wrapper for pvzhtbot.com — ONLY confirmed endpoints.
// Mirrors ../../site-research/scripts/site-api-wrapper.js (kept in sync
// manually; that copy is the source of truth for what's been verified
// against docs/api.md in site-research/).

class PvzhtbotApiError extends Error {
  constructor(message, { status, url, body } = {}) {
    super(message);
    this.name = 'PvzhtbotApiError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

class PvzhtbotApi {
  constructor({ baseUrl = 'https://api.pvzhtbot.com/tbotapp' } = {}) {
    this.baseUrl = baseUrl;
    this._csrfToken = null;
  }

  async _get(path) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new PvzhtbotApiError(`GET ${path} failed with ${res.status}`, {
        status: res.status,
        url,
        body: await res.text().catch(() => null),
      });
    }
    return res.json();
  }

  async _getCsrfToken({ forceRefresh = false } = {}) {
    if (this._csrfToken && !forceRefresh) return this._csrfToken;
    const data = await this._get('/csrf/');
    this._csrfToken = data.csrfToken;
    if (!this._csrfToken) {
      throw new PvzhtbotApiError('CSRF endpoint did not return a csrfToken', {
        url: `${this.baseUrl}/csrf/`,
        body: data,
      });
    }
    return this._csrfToken;
  }

  async _write(method, path, body) {
    const url = `${this.baseUrl}${path}`;
    const token = await this._getCsrfToken();
    const doFetch = (csrfToken) =>
      fetch(url, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRFToken': csrfToken,
        },
        body: JSON.stringify(body),
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
        body: await res.text().catch(() => null),
      });
    }
    return res.json();
  }

  // ---- Identity / session ----
  async getDiscordIdentity() {
    return this._get('/auth/discord/me/');
  }

  async getMyProfile() {
    return this._get('/profile/me/');
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
    return this._get('/cardinfo/');
  }

  async getCardCount() {
    return this._get('/card-count/');
  }

  async getMyCards() {
    return this._get('/user-cards/');
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
      throw new PvzhtbotApiError('quantity must be a non-negative integer', { body: { quantity } });
    }
    return this._write('PATCH', `/user-cards/${userCardId}/`, { quantity });
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
    if (typeof cardName !== 'string' || !cardName) {
      throw new PvzhtbotApiError('cardName must be a non-empty string', { body: { cardName } });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new PvzhtbotApiError('quantity must be a positive integer', { body: { quantity } });
    }
    return this._write('POST', '/user-cards/create/', { cards: [{ card_name: cardName, quantity }] });
  }

  /**
   * Adds multiple cards one request at a time with a delay between each
   * call, instead of one large batched request. Exists so any future
   * "add several missing cards" feature is rate-limited by construction
   * rather than relying on the caller to remember to throttle.
   * `delayMs` defaults to 1000ms between requests.
   */
  async addCardsWithRateLimit(items, { delayMs = 1000, onProgress } = {}) {
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
    return this._get('/decklists/');
  }

  async getDecklistCount() {
    return this._get('/decklist-count/');
  }

  /** CONFIRMED: GET /user-decks/ - {success, decks: []} - this account's own decks */
  async getMyDecks() {
    return this._get('/user-decks/');
  }

  // createDeck() intentionally omitted: POST .../user-decks/create/ is
  // only INFERRED from bundled-JS string matches, never independently
  // triggered/confirmed. See site-research/docs/decklists.md.

  // ---- Heroes ----
  async getAllHeroInfo() {
    return this._get('/heroinfo/');
  }
}

export { PvzhtbotApi, PvzhtbotApiError };
