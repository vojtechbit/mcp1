import assert from 'node:assert/strict';
import { describe, it, beforeEach, after } from 'node:test';
import { mock } from 'node:test';

class MockCollection {
  constructor() {
    this.documents = [];
    this.indexCalls = [];
  }

  async createIndex(fields, options) {
    this.indexCalls.push({ fields, options });
    return `${Object.keys(fields).join('_')}_idx`;
  }

  async insertOne(doc) {
    this.documents.push(doc);
    return { insertedId: doc._id ?? null };
  }

  async findOne(filter) {
    return this.documents.find(doc => matchesFilter(doc, filter)) ?? null;
  }

  async updateOne(filter, update) {
    const doc = this.documents.find(item => matchesFilter(item, filter));
    if (!doc) {
      return { matchedCount: 0, modifiedCount: 0 };
    }

    if (update?.$set) {
      Object.assign(doc, update.$set);
    }

    return { matchedCount: 1, modifiedCount: 1 };
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const doc = this.documents.find(item => matchesFilter(item, filter));
    if (!doc) {
      return { value: null };
    }

    if (update?.$set) {
      Object.assign(doc, update.$set);
    }

    const value = options.returnDocument === 'after' ? doc : { ...doc };
    return { value };
  }
}

function matchesFilter(doc, filter) {
  return Object.entries(filter).every(([key, value]) => doc[key] === value);
}

let mockCollection;
const mockDb = {
  collection: () => {
    if (!mockCollection) {
      throw new Error('Mock collection not initialized');
    }
    return mockCollection;
  }
};

const restoreDatabaseMock = mock.module('../src/config/database.js', {
  namedExports: {
    getDatabase: async () => mockDb,
    connectToDatabase: async () => mockDb,
    closeDatabase: async () => {}
  }
});

const confirmationStore = await import('../src/utils/confirmationStore.js');

const {
  initializeConfirmationStore,
  createPendingConfirmation,
  getPendingConfirmation,
  confirmPendingConfirmation,
  completePendingConfirmation
} = confirmationStore;

describe('confirmationStore', () => {
  beforeEach(() => {
    mockCollection = new MockCollection();
  });

  it('initializes TTL and unique indexes for pending confirmations', async () => {
    await initializeConfirmationStore();

    assert.equal(mockCollection.indexCalls.length, 3);

    const ttlIndex = mockCollection.indexCalls.find(
      call => call.fields.expiresAt === 1
    );
    assert.ok(ttlIndex, 'TTL index for expiresAt should exist');
    assert.deepEqual(ttlIndex.options, { expireAfterSeconds: 0 });

    const tokenIndex = mockCollection.indexCalls.find(
      call => call.fields.confirmToken === 1
    );
    assert.ok(tokenIndex, 'confirmToken index should exist');
    assert.equal(tokenIndex.options?.unique, true);
  });

  it('marks expired confirmations as expired and returns null', async () => {
    const { confirmToken } = await createPendingConfirmation('user-123', 'enrichment', { foo: 'bar' });

    const doc = mockCollection.documents.find(item => item.confirmToken === confirmToken);
    doc.expiresAt = new Date(Date.now() - 60_000);

    const result = await getPendingConfirmation(confirmToken);
    assert.equal(result, null);

    const updatedDoc = mockCollection.documents.find(item => item.confirmToken === confirmToken);
    assert.equal(updatedDoc.status, 'expired');
  });

  it('confirms a pending confirmation', async () => {
    const { confirmToken } = await createPendingConfirmation('user-456', 'deduplication', { action: 'merge' });

    const updated = await confirmPendingConfirmation(confirmToken, 'approve');

    assert.equal(updated.status, 'confirmed');
    assert.equal(updated.action, 'approve');
    assert.ok(updated.confirmedAt instanceof Date);
  });

  it('completes a confirmation', async () => {
    const { confirmToken } = await createPendingConfirmation('user-789', 'enrichment', { action: 'auto' });

    await completePendingConfirmation(confirmToken);

    const stored = mockCollection.documents.find(item => item.confirmToken === confirmToken);
    assert.equal(stored.status, 'completed');
    assert.ok(stored.completedAt instanceof Date);
  });
});

after(() => {
  restoreDatabaseMock.restore();
});
