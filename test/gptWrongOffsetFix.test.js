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
  it('strips WRONG offset from GPT and converts to UTC (THE BUG FIX)', () => {
    // REAL PROBLEM: GPT sent this on Oct 28 (after DST switch to winter):
    // "2025-10-29T07:00:00+02:00"
    // But Oct 29 is WINTER time (CET = UTC+1), NOT summer time (UTC+2)!

    const gptInput = '2025-10-29T07:00:00+02:00'; // ❌ Wrong offset for winter!
    const result = normalizeCalendarTime(gptInput);

    // Should STRIP the +02:00, interpret as Prague time, convert to UTC
    // 7:00 Prague (winter = UTC+1) = 6:00 UTC
    assert.deepEqual(result, {
      dateTime: '2025-10-29T06:00:00.000Z'  // ✅ Converted to UTC
    });

    console.log('✅ FIX: Stripped wrong +02:00 offset from GPT and converted to UTC');
    console.log('   Result: 06:00 UTC = 07:00 Prague (winter time)');
  });

  it('also strips correct offset and converts to UTC', () => {
    // Even if offset is correct, strip it and convert to UTC
    // This ensures consistency
    const input = '2025-10-29T07:00:00+01:00'; // Correct offset for winter
    const result = normalizeCalendarTime(input);

    // 7:00 Prague (winter = UTC+1) = 6:00 UTC
    assert.deepEqual(result, {
      dateTime: '2025-10-29T06:00:00.000Z'
    });
  });

  it('normalizes UTC times (Z suffix)', () => {
    // UTC times are preserved
    const input = '2025-10-29T06:00:00Z'; // 6 UTC = 7 CET (winter)
    const result = normalizeCalendarTime(input);

    assert.deepEqual(result, {
      dateTime: '2025-10-29T06:00:00.000Z'
    });
  });

  it('handles summer time correctly too', () => {
    // July is summer time (CEST = UTC+2)
    // GPT sends wrong offset here too
    const input = '2025-07-29T07:00:00+01:00'; // Wrong offset for summer!
    const result = normalizeCalendarTime(input);

    // Strip offset, interpret as Prague time, convert to UTC
    // 7:00 Prague (summer = UTC+2) = 5:00 UTC
    assert.deepEqual(result, {
      dateTime: '2025-07-29T05:00:00.000Z'
    });
  });

  it('handles times without offset', () => {
    const input = '2025-10-29T07:00:00';
    const result = normalizeCalendarTime(input);

    // Interpret as Prague time, convert to UTC
    // 7:00 Prague (winter = UTC+1) = 6:00 UTC
    assert.deepEqual(result, {
      dateTime: '2025-10-29T06:00:00.000Z'
    });
  });
});
