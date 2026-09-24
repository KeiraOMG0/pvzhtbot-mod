'use strict';

const fs = require('fs');
const path = require('path');
const { redactHeaders, redactBody, redactUrl } = require('./redact');

const TARGET_HOST_SUFFIX = 'pvzhtbot.com';

class CaptureLogger {
  constructor(outDir) {
    this.outDir = outDir;
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.filePath = path.join(outDir, `capture-${stamp}.jsonl`);
    this.count = 0;
    this.maxEvents = 500; // hard safety cap for a single session's recorded traffic
  }

  _isTarget(urlStr) {
    try {
      const u = new URL(urlStr);
      return u.hostname === TARGET_HOST_SUFFIX || u.hostname.endsWith(`.${TARGET_HOST_SUFFIX}`);
    } catch {
      return false;
    }
  }

  _append(record) {
    if (this.count >= this.maxEvents) return;
    this.count += 1;
    fs.appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf8');
  }

  attach(page) {
    page.on('request', async (request) => {
      try {
        const url = request.url();
        if (!this._isTarget(url)) return;
        // Only log XHR/fetch (API-ish) plus document navigations; skip static assets.
        const type = request.resourceType();
        if (!['xhr', 'fetch', 'document'].includes(type)) return;

        const headers = redactHeaders(request.headers());
        let bodyText = null;
        try {
          bodyText = request.postData();
        } catch {
          bodyText = null;
        }
        const contentType = headers['content-type'] || headers['Content-Type'];

        this._append({
          kind: 'request',
          ts: new Date().toISOString(),
          method: request.method(),
          url: redactUrl(url),
          resourceType: type,
          headers,
          body: redactBody(bodyText, contentType),
        });
      } catch (err) {
        this._append({ kind: 'request-error', ts: new Date().toISOString(), error: String(err) });
      }
    });

    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (!this._isTarget(url)) return;
        const request = response.request();
        const type = request.resourceType();
        if (!['xhr', 'fetch', 'document'].includes(type)) return;

        const headers = redactHeaders(response.headers());
        const contentType = headers['content-type'] || headers['Content-Type'] || '';
        let bodySnippet = null;
        try {
          if (contentType.includes('application/json') || contentType.includes('text/')) {
            const text = await response.text();
            bodySnippet = redactBody(text, contentType);
            // Cap size to avoid huge captures.
            if (bodySnippet && bodySnippet.length > 8000) {
              bodySnippet = bodySnippet.slice(0, 8000) + '...[truncated]';
            }
          } else {
            bodySnippet = `[non-text body, content-type=${contentType}]`;
          }
        } catch (err) {
          bodySnippet = `[could not read body: ${String(err)}]`;
        }

        this._append({
          kind: 'response',
          ts: new Date().toISOString(),
          status: response.status(),
          url: redactUrl(url),
          resourceType: type,
          headers,
          body: bodySnippet,
        });
      } catch (err) {
        this._append({ kind: 'response-error', ts: new Date().toISOString(), error: String(err) });
      }
    });
  }
}

module.exports = { CaptureLogger, TARGET_HOST_SUFFIX };
