/**
 * Minimal Site API wrapper for pvzhtbot.com — Tampermonkey-ready.
 *
 * Scope: ONLY endpoints and behaviors actually confirmed by live capture
 * (see ../docs/api.md). No bulk operations, no unconfirmed endpoints
 * (bulk create, delete) are exposed here.
 *
 * This is intended to sit at the "Site API wrapper" layer of:
 *   Tampermonkey -> Core loader -> Site API wrapper -> Plugin manager -> Plugins
 * It does not implement the loader or plugin manager - just the wrapper.
 *
 * Usage (inside a Tampermonkey userscript running on *.pvzhtbot.com,
 * where @grant is left as none / not needed since this uses same-origin
 * fetch with the browser's existing session cookie):
 *
 *   const api = new PvzhtbotApi();
 *   const me = await api.getDiscordIdentity();
 *   const cards = await api.getMyCards();
 */

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
      throw new PvzhtbotApiError('CSRF endpoint did not return a csrfToken', { url: `${this.baseUrl}/csrf/`, body: data });
    }
    return this._csrfToken;
  }

  async _write(method, path, body) {
    const url = `${this.baseUrl}${path}`;
    const token = await this._getCsrfToken();
    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRFToken': token,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // CSRF tokens may be single-use/short-lived (unconfirmed) - one retry
      // with a fresh token before surfacing the error.
      if (res.status === 403) {
        const freshToken = await this._getCsrfToken({ forceRefresh: true });
        const retry = await fetch(url, {
          method,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRFToken': freshToken,
          },
          body: JSON.stringify(body),
        });
        if (retry.ok) return retry.json();
        throw new PvzhtbotApiError(`${method} ${path} failed with ${retry.status} (after CSRF retry)`, {
          status: retry.status,
          url,
          body: await retry.text().catch(() => null),
        });
      }
      throw new PvzhtbotApiError(`${method} ${path} failed with ${res.status}`, {
        status: res.status,
        url,
        body: await res.text().catch(() => null),
      });
    }
    return res.json();
  }

  // ---- Identity / session -------------------------------------------------

  /** CONFIRMED: GET /auth/discord/me/ */
  async getDiscordIdentity() {
    return this._get('/auth/discord/me/');
  }

  /** CONFIRMED: GET /profile/me/ */
  async getMyProfile() {
    return this._get('/profile/me/');
  }

  // ---- Profiles -------------------------------------------------------------

  /** CONFIRMED: GET /profile/<username>/ */
  async getProfile(username) {
    return this._get(`/profile/${encodeURIComponent(username)}/`);
  }

  /** CONFIRMED: GET /profile/<username>/decks/ */
  async getProfileDecks(username) {
    return this._get(`/profile/${encodeURIComponent(username)}/decks/`);
  }

  /** CONFIRMED: GET /profile/<username>/cards/ */
  async getProfileCards(username) {
    return this._get(`/profile/${encodeURIComponent(username)}/cards/`);
  }

  // ---- Cards ----------------------------------------------------------------

  /** CONFIRMED: GET /cardinfo/ - full static card database */
  async getAllCardInfo() {
    return this._get('/cardinfo/');
  }

  /** CONFIRMED: GET /card-count/ - total distinct cards in the game */
  async getCardCount() {
    return this._get('/card-count/');
  }

  /** CONFIRMED: GET /user-cards/ - current session user's full collection */
  async getMyCards() {
    return this._get('/user-cards/');
  }

  /** CONFIRMED: GET /user-cards/classes/?side=<side> */
  async getClasses(side) {
    return this._get(`/user-cards/classes/?side=${encodeURIComponent(side)}`);
  }

  /** CONFIRMED: GET /user-cards/available/?side=<side>&class=<class> */
  async getAvailableCards(side, cardClass) {
    return this._get(`/user-cards/available/?side=${encodeURIComponent(side)}&class=${encodeURIComponent(cardClass)}`);
  }

  /**
   * CONFIRMED: PATCH /user-cards/<id>/  body {quantity}
   * `userCardId` is the `id` field from a getMyCards() entry (NOT the
   * game's cardid). Live-tested as a net-zero 4 -> 3 -> 4 edit.
   */
  async setCardQuantity(userCardId, quantity) {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new PvzhtbotApiError('quantity must be a non-negative integer', { body: { quantity } });
    }
    return this._write('PATCH', `/user-cards/${userCardId}/`, { quantity });
  }

  /**
   * CONFIRMED: POST /user-cards/create/  body {cards: [{card_name, quantity}]}
   * Live-tested single-card (201, {success, created, cards}). Multi-card
   * and already-owned-conflict behavior are UNCONFIRMED - see docs/cards.md.
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

  // ---- NOT implemented: unconfirmed endpoints ------------------------------
  // deleteCard() is intentionally omitted. DELETE /user-cards/<id>/ is
  // only INFERRED (see docs/api.md) - do not wire it up until confirmed
  // by an actual single-action capture.

  /** CONFIRMED: GET /decklists/ - full public community deck list */
  async getAllDecklists() {
    return this._get('/decklists/');
  }

  /** CONFIRMED: GET /decklist-count/ */
  async getDecklistCount() {
    return this._get('/decklist-count/');
  }

  /** CONFIRMED: GET /user-decks/ - {success, decks: []} - this account's own decks */
  async getMyDecks() {
    return this._get('/user-decks/');
  }

  /** CONFIRMED: GET /heroinfo/ - {count, results: [...]} */
  async getAllHeroInfo() {
    return this._get('/heroinfo/');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PvzhtbotApi, PvzhtbotApiError };
}
