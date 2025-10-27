import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
process.env.REDIRECT_URI = process.env.REDIRECT_URI || 'https://example.com/oauth';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.BASE_URL = process.env.BASE_URL || 'https://example.com';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete globalThis.__facadeMocks;
  mock.restoreAll();
});

afterEach(() => {
  if (ORIGINAL_NODE_ENV) {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  } else {
    delete process.env.NODE_ENV;
  }
  delete globalThis.__facadeMocks;
  mock.restoreAll();
});

describe('calendarPlan timezone boundaries', () => {
  it('uses Prague midnights for weekly ranges across DST fallback', async () => {
    const listCalendarEvents = mock.fn(async () => ({ items: [] }));

    globalThis.__facadeMocks = {
      calendarService: {
        listCalendarEvents
      }
    };

    const { calendarPlan } = await import('../src/services/facadeService.js');

    const result = await calendarPlan('test-sub', {
      scope: 'weekly',
      date: '2024-10-27',
      includePast: true
    });

    assert.equal(listCalendarEvents.mock.calls.length, 1);
    const callArgs = listCalendarEvents.mock.calls[0].arguments[1];
    assert.equal(callArgs.timeMin, '2024-10-20T22:00:00.000Z');
    assert.equal(callArgs.timeMax, '2024-10-27T23:00:00.000Z');

    assert.deepEqual(result.range, {
      start: '2024-10-20T22:00:00.000Z',
      end: '2024-10-27T23:00:00.000Z',
      tz: 'Europe/Prague'
    });
  });

  it('uses Prague midnights for daily ranges across DST spring forward', async () => {
    const listCalendarEvents = mock.fn(async () => ({ items: [] }));

    globalThis.__facadeMocks = {
      calendarService: {
        listCalendarEvents
      }
    };

    const { calendarPlan } = await import('../src/services/facadeService.js');

    const result = await calendarPlan('test-sub', {
      scope: 'daily',
      date: '2024-03-31',
      includePast: true
    });

    assert.equal(listCalendarEvents.mock.calls.length, 1);
    const callArgs = listCalendarEvents.mock.calls[0].arguments[1];
    assert.equal(callArgs.timeMin, '2024-03-30T23:00:00.000Z');
    assert.equal(callArgs.timeMax, '2024-03-31T22:00:00.000Z');

    assert.deepEqual(result.range, {
      start: '2024-03-30T23:00:00.000Z',
      end: '2024-03-31T22:00:00.000Z',
      tz: 'Europe/Prague'
    });
  });
});
