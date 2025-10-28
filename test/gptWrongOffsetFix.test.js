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

describe('Fix GPT wrong offset bug', () => {
  it('ignores WRONG offset from GPT and keeps requested wall time', () => {
    // REAL PROBLEM: GPT sent this on Oct 28 (after DST switch to winter):
    // "2025-10-29T07:00:00+02:00"
    // But Oct 29 is WINTER time (CET = UTC+1), NOT summer time (UTC+2)!

    const gptInput = '2025-10-29T07:00:00+02:00'; // ❌ Wrong offset for winter!
    const result = normalizeCalendarTime(gptInput);

    assert.deepEqual(result, {
      dateTime: '2025-10-29T07:00:00',
      timeZone: 'Europe/Prague'
    });
  });

  it('also strips correct offset but keeps wall time for consistency', () => {
    const input = '2025-10-29T07:00:00+01:00'; // Correct offset for winter
    const result = normalizeCalendarTime(input);

    assert.deepEqual(result, {
      dateTime: '2025-10-29T07:00:00',
      timeZone: 'Europe/Prague'
    });
  });

  it('removes Z suffix while keeping the same clock time', () => {
    const input = '2025-10-29T06:00:00Z';
    const result = normalizeCalendarTime(input);

    assert.deepEqual(result, {
      dateTime: '2025-10-29T06:00:00',
      timeZone: 'Europe/Prague'
    });
  });

  it('handles summer time correctly too', () => {
    // July is summer time (CEST = UTC+2)
    // GPT sends wrong offset here too
    const input = '2025-07-29T07:00:00+01:00'; // Wrong offset for summer!
    const result = normalizeCalendarTime(input);

    assert.deepEqual(result, {
      dateTime: '2025-07-29T07:00:00',
      timeZone: 'Europe/Prague'
    });
  });

  it('handles times without offset', () => {
    const input = '2025-10-29T07:00:00';
    const result = normalizeCalendarTime(input);

    assert.deepEqual(result, {
      dateTime: '2025-10-29T07:00:00',
      timeZone: 'Europe/Prague'
    });
  });
});
