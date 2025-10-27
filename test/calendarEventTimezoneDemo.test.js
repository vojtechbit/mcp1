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

const { convertToUtcIfNeeded } = await import('../src/utils/helpers.js');

describe('Calendar event timezone fix demonstration', () => {
  it('correctly handles 23:00 Prague event in winter (the reported bug)', () => {
    // PROBLEM: User creates event at 23:00 Prague time
    // BUG: It showed as 22:00 (off by one hour)
    // ROOT CAUSE: Server in UTC interpreted "23:00" as UTC instead of Prague time

    // October 27, 2025 is in winter time (CET = UTC+1)
    const pragueTime = '2025-10-27T23:00:00'; // User wants 23:00 Prague
    const utcTime = convertToUtcIfNeeded(pragueTime);

    // Should convert to 22:00 UTC (23:00 CET - 1 hour = 22:00 UTC)
    assert.equal(utcTime, '2025-10-27T22:00:00.000Z',
      'Should convert 23:00 Prague (winter) to 22:00 UTC');

    // Verify: When Google Calendar stores this UTC time and displays it in Prague timezone,
    // it will show 23:00 Prague time (22:00 UTC + 1 hour = 23:00 CET) ✅
  });

  it('correctly handles end of day (23:59) in Prague', () => {
    const pragueEndOfDay = '2025-10-27T23:59:00';
    const utcTime = convertToUtcIfNeeded(pragueEndOfDay);

    assert.equal(utcTime, '2025-10-27T22:59:00.000Z',
      'Should convert 23:59 Prague to 22:59 UTC');
  });

  it('handles same time in summer (demonstrates DST awareness)', () => {
    // July 27, 2025 is in summer time (CEST = UTC+2)
    const pragueTime = '2025-07-27T23:00:00';
    const utcTime = convertToUtcIfNeeded(pragueTime);

    // Should convert to 21:00 UTC (23:00 CEST - 2 hours = 21:00 UTC)
    assert.equal(utcTime, '2025-07-27T21:00:00.000Z',
      'Should convert 23:00 Prague (summer) to 21:00 UTC');
  });

  it('preserves explicit UTC times unchanged', () => {
    const explicitUtc = '2025-10-27T23:00:00Z';
    const result = convertToUtcIfNeeded(explicitUtc);

    assert.equal(result, '2025-10-27T23:00:00.000Z',
      'Should preserve explicit UTC time');
  });
});
