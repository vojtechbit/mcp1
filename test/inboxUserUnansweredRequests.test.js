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
  it('auto-creates missing labels and applies them by default', async () => {
    const labels = [
      { id: 'Label_tracking', name: 'meta_seen', type: 'user', color: null }
    ];

    const gmailMocks = {
      listLabels: mock.fn(async () => labels),
      getUserAddresses: mock.fn(async () => ['user@example.com']),
      createLabel: mock.fn(async () => ({
        id: 'Label_unreplied',
        name: 'nevyřízeno',
        color: '#d93025',
        textColor: '#ffffff'
      })),
      modifyMessageLabels: mock.fn(async () => ({ success: true }))
    };

    const databaseMocks = {
      getUserByGoogleSub: mock.fn(async () => ({ email: 'user@example.com' }))
    };

    const unreadBucket = {
      items: [
        {
          threadId: 't-unread-1',
          messageId: 'm-last',
          candidateMessageIds: ['m-last', 'm-draft'],
          labelApplied: false,
          trackingLabelApplied: false
        }
      ],
      subset: false,
      nextPageToken: null,
      scanned: 2,
      overflowCount: 0,
      skippedReasons: {}
    };

    const readBucket = {
      items: [],
      subset: false,
      nextPageToken: null,
      scanned: 0,
      overflowCount: 0,
      skippedReasons: {}
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
    assert.equal(gmailMocks.createLabel.mock.calls.length, 1);
    assert.equal(gmailMocks.modifyMessageLabels.mock.calls.length, 2);
    assert.equal(result.summary.labelAlreadyApplied, 1);
    assert.equal(result.summary.trackingLabelAlreadyApplied, 1);
    assert.equal(result.summary.missingLabel, false);
    assert.equal(result.unread.items[0].labelApplied, true);
    assert.equal(result.unread.items[0].trackingLabelApplied, true);
  });

  it('respects autoAddLabels=false and custom label names', async () => {
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
      getUserAddresses: mock.fn(async () => []),
      modifyMessageLabels: mock.fn(async () => ({ success: true }))
    };

    const databaseMocks = {
      getUserByGoogleSub: mock.fn(async () => null)
    };

    const bucket = {
      items: [
        {
          threadId: 't-single',
          messageId: 'm-single',
          candidateMessageIds: ['m-single'],
          labelApplied: false,
          trackingLabelApplied: false
        }
      ],
      subset: false,
      nextPageToken: null,
      scanned: 1,
      overflowCount: 0,
      skippedReasons: { userReplyPresent: 1 }
    };

    const collectStub = mock.fn(async () => bucket);

    globalThis.__facadeMocks = {
      gmailService: gmailMocks,
      databaseService: databaseMocks,
      collectUnansweredThreads: collectStub
    };

    const result = await inboxUserUnansweredRequests('test-google-sub', {
      labelName: 'Team Follow Up',
      autoAddLabels: false
    });

    assert.equal(gmailMocks.modifyMessageLabels.mock.calls.length, 0);
    assert.equal(result.labelRecommendation.missingLabel, false);
    assert.ok(result.labelRecommendation.existingLabel, 'existing label metadata should be present');
    assert.equal(result.summary.missingLabel, false);
    assert.equal(result.unread.items[0].labelApplied, false);
  });
});
