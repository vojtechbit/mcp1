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
  it('strips WRONG offset from GPT and uses Prague timezone (THE BUG FIX)', () => {
    // REAL PROBLEM: GPT sent this on Oct 28 (after DST switch to winter):
    // "2025-10-29T07:00:00+02:00"
    // But Oct 29 is WINTER time (CET = UTC+1), NOT summer time (UTC+2)!

    const gptInput = '2025-10-29T07:00:00+02:00'; // ❌ Wrong offset for winter!
    const result = normalizeCalendarTime(gptInput);

    // Should STRIP the +02:00 and add Prague timezone
    // Google will then apply CORRECT offset (UTC+1 for winter)
    assert.deepEqual(result, {
      dateTime: '2025-10-29T07:00:00',  // ✅ Offset stripped
      timeZone: 'Europe/Prague'          // ✅ Let Google handle DST
    });

    console.log('✅ FIX: Stripped wrong +02:00 offset from GPT');
    console.log('   Result: 7:00 Prague time (Google will use UTC+1 for winter)');
  });

  it('also strips correct offset (safer to always use timeZone)', () => {
    // Even if offset is correct, strip it and use timeZone
    // This ensures consistency
    const input = '2025-10-29T07:00:00+01:00'; // Correct offset for winter
    const result = normalizeCalendarTime(input);

    assert.deepEqual(result, {
      dateTime: '2025-10-29T07:00:00',
      timeZone: 'Europe/Prague'
    });
  });

  it('preserves UTC times (Z suffix)', () => {
    // UTC times are unambiguous, keep them
    const input = '2025-10-29T06:00:00Z'; // 6 UTC = 7 CET (winter)
    const result = normalizeCalendarTime(input);

    assert.deepEqual(result, {
      dateTime: '2025-10-29T06:00:00Z'
    });
  });

  it('handles summer time correctly too', () => {
    // July is summer time (CEST = UTC+2)
    // But GPT might send wrong offset here too
    const input = '2025-07-29T07:00:00+01:00'; // Wrong offset for summer!
    const result = normalizeCalendarTime(input);

    // Strip and use Prague timezone
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
