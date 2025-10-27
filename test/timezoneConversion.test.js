import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Setup environment before imports
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.REDIRECT_URI = 'https://example.com/oauth';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.BASE_URL = 'https://example.com';
process.env.NODE_ENV = 'test';

const { convertToUtcIfNeeded } = await import('../src/utils/helpers.js');

describe('Timezone conversion', () => {
  it('converts Prague time without timezone to UTC (winter time)', () => {
    // October 27, 2025 is in winter time (CET = UTC+1)
    // 23:00 Prague time should be 22:00 UTC
    const input = '2025-10-27T23:00:00';
    const result = convertToUtcIfNeeded(input);

    assert.equal(result, '2025-10-27T22:00:00.000Z',
      'Should convert 23:00 CET (winter) to 22:00 UTC');
  });

  it('converts Prague time without timezone to UTC (summer time)', () => {
    // July 27, 2025 is in summer time (CEST = UTC+2)
    // 23:00 Prague time should be 21:00 UTC
    const input = '2025-07-27T23:00:00';
    const result = convertToUtcIfNeeded(input);

    assert.equal(result, '2025-07-27T21:00:00.000Z',
      'Should convert 23:00 CEST (summer) to 21:00 UTC');
  });

  it('preserves UTC time when Z suffix is present', () => {
    const input = '2025-10-27T23:00:00Z';
    const result = convertToUtcIfNeeded(input);

    assert.equal(result, '2025-10-27T23:00:00.000Z',
      'Should preserve UTC time when Z suffix present');
  });

  it('converts time with explicit timezone offset', () => {
    const input = '2025-10-27T23:00:00+01:00';
    const result = convertToUtcIfNeeded(input);

    assert.equal(result, '2025-10-27T22:00:00.000Z',
      'Should convert time with explicit +01:00 offset to UTC');
  });

  it('handles noon correctly in winter', () => {
    // 12:00 CET should be 11:00 UTC
    const input = '2025-10-27T12:00:00';
    const result = convertToUtcIfNeeded(input);

    assert.equal(result, '2025-10-27T11:00:00.000Z',
      'Should convert 12:00 CET to 11:00 UTC');
  });

  it('handles midnight correctly in winter', () => {
    // 00:00 CET should be 23:00 UTC previous day
    const input = '2025-10-27T00:00:00';
    const result = convertToUtcIfNeeded(input);

    assert.equal(result, '2025-10-26T23:00:00.000Z',
      'Should convert midnight CET to 23:00 UTC previous day');
  });
});
