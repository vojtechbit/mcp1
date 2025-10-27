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

describe('normalizeCalendarTime - CORRECT timezone approach', () => {
  it('adds timeZone field for Prague time without timezone (THE FIX)', () => {
    // User wants 23:00 Prague time
    const input = '2025-10-28T23:00:00';
    const result = normalizeCalendarTime(input);

    // Should return time as-is WITH timeZone field
    // Google Calendar will then interpret it correctly with DST
    assert.deepEqual(result, {
      dateTime: '2025-10-28T23:00:00',
      timeZone: 'Europe/Prague'
    });

    console.log('✅ Correct approach: Send Prague time WITH timeZone field');
    console.log('   Google Calendar will display: 23:00 Prague time');
  });

  it('preserves UTC times without timeZone field', () => {
    const input = '2025-10-28T22:00:00Z';
    const result = normalizeCalendarTime(input);

    // UTC times don't need timeZone field
    assert.deepEqual(result, {
      dateTime: '2025-10-28T22:00:00Z'
    });
  });

  it('preserves times with explicit offset', () => {
    const input = '2025-10-28T23:00:00+01:00';
    const result = normalizeCalendarTime(input);

    // Times with offset don't need timeZone field
    assert.deepEqual(result, {
      dateTime: '2025-10-28T23:00:00+01:00'
    });
  });

  it('handles summer time correctly (demonstrates DST awareness)', () => {
    // July 27 is summer time (CEST)
    const input = '2025-07-27T23:00:00';
    const result = normalizeCalendarTime(input);

    // Same approach - add timeZone field
    // Google will apply CEST (UTC+2) automatically
    assert.deepEqual(result, {
      dateTime: '2025-07-27T23:00:00',
      timeZone: 'Europe/Prague'
    });
  });
});
