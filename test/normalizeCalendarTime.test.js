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

describe('normalizeCalendarTime - UTC conversion approach', () => {
  it('converts Prague time to UTC (THE FIX)', () => {
    // User wants 23:00 Prague time
    const input = '2025-10-28T23:00:00';
    const result = normalizeCalendarTime(input);

    // Should convert to UTC: 23:00 Prague (winter = UTC+1) = 22:00 UTC
    assert.deepEqual(result, {
      dateTime: '2025-10-28T22:00:00.000Z'
    });

    console.log('✅ Correct approach: Convert Prague time to UTC');
    console.log('   Result: 22:00 UTC = 23:00 Prague (winter time)');
  });

  it('normalizes UTC times', () => {
    const input = '2025-10-28T22:00:00Z';
    const result = normalizeCalendarTime(input);

    // UTC times are normalized
    assert.deepEqual(result, {
      dateTime: '2025-10-28T22:00:00.000Z'
    });
  });

  it('strips offset and converts to UTC (safer approach)', () => {
    const input = '2025-10-28T23:00:00+01:00';
    const result = normalizeCalendarTime(input);

    // Strip offset, interpret as Prague time, convert to UTC
    // 23:00 Prague (winter = UTC+1) = 22:00 UTC
    assert.deepEqual(result, {
      dateTime: '2025-10-28T22:00:00.000Z'
    });
  });

  it('handles summer time correctly (demonstrates DST awareness)', () => {
    // July 27 is summer time (CEST = UTC+2)
    const input = '2025-07-27T23:00:00';
    const result = normalizeCalendarTime(input);

    // Convert to UTC: 23:00 Prague (summer = UTC+2) = 21:00 UTC
    assert.deepEqual(result, {
      dateTime: '2025-07-27T21:00:00.000Z'
    });
  });
});
