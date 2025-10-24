const SENSITIVE_KEYS = new Set([
  'token',
  'secret',
  'password',
  'authorization',
  'cookie',
  'code'
]);

function summarizeSecret(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return value === undefined ? undefined : '[redacted]';
  }

  if (value.length <= 8) {
    return '[redacted]';
  }

  const prefix = value.slice(0, 4);
  const suffix = value.slice(-4);
  return `${prefix}…${suffix} (len=${value.length})`;
}

function sanitizePrimitive(value, keyHint) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (keyHint && shouldMaskKey(keyHint)) {
      return summarizeSecret(value);
    }

    if (isLikelySecret(value)) {
      return summarizeSecret(value);
    }

    if (value.length > 200) {
      return `${value.slice(0, 200)}… (len=${value.length})`;
    }

    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function shouldMaskKey(key) {
  if (!key) return false;
  return Array.from(SENSITIVE_KEYS).some(sensitive => key.toLowerCase().includes(sensitive));
}

function isLikelySecret(value) {
  if (typeof value !== 'string') return false;
  if (value.length >= 32 && /^[a-z0-9\-_\.]+$/i.test(value)) {
    return true;
  }

  if (value.startsWith('ya29.') || value.startsWith('1//')) {
    return true;
  }

  return false;
}

function redactValue(value, keyHint) {
  if (Array.isArray(value)) {
    if (value.length > 25) {
      return `Array(len=${value.length})`;
    }

    return value.map(item => redactValue(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).slice(0, 25).map(([key, val]) => [
      key,
      shouldMaskKey(key) ? summarizeSecret(String(val ?? '')) : redactValue(val, key)
    ]);

    if (Object.keys(value).length > 25) {
      entries.push(['__truncatedKeys', Object.keys(value).length - 25]);
    }

    return Object.fromEntries(entries);
  }

  return sanitizePrimitive(value, keyHint);
}

function sanitizeForLog(payload) {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload !== 'object') {
    return redactValue(payload);
  }

  return redactValue(payload);
}

export { sanitizeForLog, summarizeSecret };
