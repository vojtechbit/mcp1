import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import './helpers/cleanupFacadeMocks.js';

process.env.GOOGLE_CLIENT_ID ||= 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET ||= 'test-client-secret';
process.env.REDIRECT_URI ||= 'https://example.com/oauth';
process.env.MONGODB_URI ||= 'mongodb://localhost:27017/test-db';
process.env.ENCRYPTION_KEY ||= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.NODE_ENV = 'test';

const { inboxUserUnansweredRequests } = await import('../src/services/facadeService.js');

describe('inboxUserUnansweredRequests', () => {
  it('applies default filters and aggregates summary based on collect stubs', async () => {
    const labels = [
      { id: 'Label_tracking', name: 'meta_seen', type: 'user', color: null },
      { id: 'Label_misc', name: 'Random label', type: 'user', color: null }
    ];

    const gmailMocks = {
      listLabels: mock.fn(async () => labels),
      getUserAddresses: mock.fn(async () => ['user@example.com'])
    };

    const databaseMocks = {
      getUserByGoogleSub: mock.fn(async () => ({ email: 'user@example.com' }))
    };

    const unreadBucket = {
      items: [
        { threadId: 't-unread-1', labelApplied: true, trackingLabelApplied: false },
        { threadId: 't-unread-2', labelApplied: false, trackingLabelApplied: true }
      ],
      subset: false,
      nextPageToken: null,
      scanned: 4,
      overflowCount: 1,
      skippedReasons: {
        userReplyPresent: 1,
        trackingLabelPresent: 2
      }
    };

    const readBucket = {
      items: [
        { threadId: 't-read-1', labelApplied: false, trackingLabelApplied: false }
      ],
      subset: false,
      nextPageToken: null,
      scanned: 2,
      overflowCount: 0,
      skippedReasons: {
        trackingLabelPresent: 1
      }
    };

    const collectStub = mock.fn(async (options) => {
      if (options.querySuffix === 'is:unread') {
        return unreadBucket;
      }
      if (options.querySuffix === '-is:unread') {
        return readBucket;
      }
      throw new Error(`Unexpected query suffix: ${options.querySuffix}`);
    });

    globalThis.__facadeMocks = {
      gmailService: gmailMocks,
      databaseService: databaseMocks,
      collectUnansweredThreads: collectStub
    };

    const result = await inboxUserUnansweredRequests('test-google-sub');

    assert.equal(result.summary.timeRangeSource, 'default_today');
    assert.ok(
      collectStub.mock.calls[0].arguments[0].baseQuery.includes('category:primary'),
      'baseQuery should constrain to Primary category by default'
    );
    assert.equal(result.summary.unreadCount, unreadBucket.items.length);
    assert.equal(result.summary.labelAlreadyApplied, 1);
    assert.equal(result.summary.trackingLabelMissing, false);
    assert.equal(result.labelRecommendation.missingLabel, true);
  });

  it('respects provided labelName when evaluating missingLabel state', async () => {
    const labels = [
      {
        id: 'Label_custom',
        name: 'Team Follow Up',
        type: 'user',
        color: { backgroundColor: '#0b57d0', textColor: '#ffffff' }
      },
      { id: 'Label_tracking', name: 'meta_seen', type: 'user', color: null }
    ];

    const gmailMocks = {
      listLabels: mock.fn(async () => labels),
      getUserAddresses: mock.fn(async () => [])
    };

    const databaseMocks = {
      getUserByGoogleSub: mock.fn(async () => null)
    };

    const bucket = {
      items: [
        { threadId: 't-single', labelApplied: false, trackingLabelApplied: false }
      ],
      subset: false,
      nextPageToken: null,
      scanned: 1,
      overflowCount: 0,
      skippedReasons: {}
    };

    const collectStub = mock.fn(async (options) => bucket);

    globalThis.__facadeMocks = {
      gmailService: gmailMocks,
      databaseService: databaseMocks,
      collectUnansweredThreads: collectStub
    };

    const result = await inboxUserUnansweredRequests('test-google-sub', {
      labelName: 'Team Follow Up'
    });

    assert.equal(result.labelRecommendation.missingLabel, false);
    assert.ok(result.labelRecommendation.existingLabel, 'existing label metadata should be present');
    assert.equal(result.summary.missingLabel, false);
  });
});
