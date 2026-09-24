'use strict';

// Header names whose values are always secrets and must never be written to disk.
const SENSITIVE_HEADER_NAMES = new Set([
  'cookie',
  'set-cookie',
  'authorization',
  'x-api-key',
  'x-auth-token',
  'x-session-token',
  'x-csrf-token', // value redacted, but presence/name is logged separately as a protection signal
  'proxy-authorization',
]);

// Body/query field names whose values are redacted regardless of key casing.
const SENSITIVE_FIELD_PATTERN = /(password|passwd|secret|token|api[_-]?key|session|auth|cookie|bearer)/i;

function redactString(value) {
  if (typeof value !== 'string') return value;
  return `[REDACTED len=${value.length}]`;
}

function redactHeaders(headers) {
  if (!headers) return headers;
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(lower)) {
      out[key] = redactString(String(value));
    } else {
      out[key] = value;
    }
  }
  return out;
}

function redactJsonValue(val) {
  if (Array.isArray(val)) return val.map(redactJsonValue);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      if (SENSITIVE_FIELD_PATTERN.test(k)) {
        out[k] = redactString(typeof v === 'string' ? v : JSON.stringify(v));
      } else {
        out[k] = redactJsonValue(v);
      }
    }
    return out;
  }
  return val;
}

function redactBody(bodyText, contentType) {
  if (!bodyText) return bodyText;
  if (contentType && contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(bodyText);
      return JSON.stringify(redactJsonValue(parsed));
    } catch {
      return '[unparseable JSON body, not stored raw]';
    }
  }
  if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
    try {
      const params = new URLSearchParams(bodyText);
      const out = new URLSearchParams();
      for (const [k, v] of params.entries()) {
        out.set(k, SENSITIVE_FIELD_PATTERN.test(k) ? redactString(v) : v);
      }
      return out.toString();
    } catch {
      return '[unparseable form body, not stored raw]';
    }
  }
  // Unknown content type: do not store raw body text to be safe, just size/shape info.
  return `[body len=${bodyText.length}, content-type=${contentType || 'unknown'}, not stored raw]`;
}

function redactUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    for (const key of Array.from(u.searchParams.keys())) {
      if (SENSITIVE_FIELD_PATTERN.test(key)) {
        u.searchParams.set(key, '[REDACTED]');
      }
    }
    return u.toString();
  } catch {
    return urlStr;
  }
}

module.exports = {
  redactHeaders,
  redactBody,
  redactUrl,
  redactJsonValue,
  SENSITIVE_HEADER_NAMES,
};
