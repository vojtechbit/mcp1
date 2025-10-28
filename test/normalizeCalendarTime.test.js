import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Setup environment
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.REDIRECT_URI = 'https://example.com/oauth';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.BASE_URL = 'https://example.com';
process.env.NODE_ENV = 'test';

const { normalizeCalendarTime } = await import('../src/utils/helpers.js');

describe('normalizeCalendarTime - retain wall-clock time', () => {
  it('keeps Prague local time when no timezone provided', () => {
    // User wants 23:00 Prague time
    const input = '2025-10-28T23:00:00';
    const result = normalizeCalendarTime(input);

    assert.deepEqual(result, {
      dateTime: '2025-10-28T23:00:00',
      timeZone: 'Europe/Prague'
    });
  });

  it('strips trailing Z suffix and keeps wall time', () => {
    const input = '2025-10-28T22:00:00Z';
    const result = normalizeCalendarTime(input);

    assert.deepEqual(result, {
      dateTime: '2025-10-28T22:00:00',
      timeZone: 'Europe/Prague'
    });
  });

  it('strips offset and keeps requested wall time', () => {
    const input = '2025-10-28T23:00:00+01:00';
    const result = normalizeCalendarTime(input);

    assert.deepEqual(result, {
      dateTime: '2025-10-28T23:00:00',
      timeZone: 'Europe/Prague'
    });
  });

  it('preserves fractional seconds when present', () => {
    const input = '2025-07-27T23:00:00.250';
    const result = normalizeCalendarTime(input);

    assert.deepEqual(result, {
      dateTime: '2025-07-27T23:00:00.250',
      timeZone: 'Europe/Prague'
    });
  });
});
