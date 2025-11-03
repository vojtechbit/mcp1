import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
process.env.REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost/callback';

const calls = {
  update: [],
  delete: [],
  bulkDelete: []
};

globalThis.__CONTACTS_ACTIONS_TEST_OVERRIDES = {
  contactsService: {
    updateContact: async (token, payload) => {
      calls.update.push({ token, payload });
      return { ...payload };
    },
    deleteContact: async (token, payload) => {
      calls.delete.push({ token, payload });
      return { deleted: { email: payload.email || 'n/a' } };
    },
    bulkDelete: async (token, payload) => {
      calls.bulkDelete.push({ token, payload });
      return { deleted: (payload.rowIds || payload.emails || []).length };
    }
  }
};

const {
  modifyContact,
  deleteContact,
  bulkDeleteContacts
} = await import('../contactsActionsController.js');
delete globalThis.__CONTACTS_ACTIONS_TEST_OVERRIDES;

class MockResponse {
  constructor() {
    this.statusCode = 200;
    this.body = null;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  json(payload) {
    this.body = payload;
    return this;
  }
}

test('modifyContact validates payload and calls updateContact', async () => {
  calls.update.length = 0;

  const request = {
    body: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+420 555 555 555',
      realestate: 'Acme, s.r.o.'
    },
    user: { accessToken: 'token-xyz' }
  };
  const response = new MockResponse();

  await modifyContact(request, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.deepEqual(calls.update, [
    {
      token: 'token-xyz',
      payload: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+420 555 555 555',
        notes: undefined,
        realEstate: 'Acme, s.r.o.'
      }
    }
  ]);
});

test('modifyContact enforces required fields', async () => {
  const request = {
    body: {
      email: 'missing-name@example.com'
    },
    user: { accessToken: 'token-xyz' }
  };
  const response = new MockResponse();

  await modifyContact(request, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, 'CONTACT_NAME_AND_EMAIL_REQUIRED');
  assert.equal(calls.update.length, 1); // unchanged from previous success call
});

test('deleteContact delegates to service', async () => {
  calls.delete.length = 0;

  const request = {
    body: { email: 'remove@example.com' },
    user: { accessToken: 'token-del' }
  };
  const response = new MockResponse();

  await deleteContact(request, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.deepEqual(calls.delete, [
    {
      token: 'token-del',
      payload: { email: 'remove@example.com', name: undefined }
    }
  ]);
});

test('bulkDeleteContacts accepts rowIds', async () => {
  calls.bulkDelete.length = 0;

  const request = {
    body: { rowIds: [3, 5] },
    user: { accessToken: 'token-bulk' }
  };
  const response = new MockResponse();

  await bulkDeleteContacts(request, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.mode, 'rowIds');
  assert.deepEqual(calls.bulkDelete, [
    {
      token: 'token-bulk',
      payload: { emails: undefined, rowIds: [3, 5] }
    }
  ]);
});

test('bulkDeleteContacts rejects missing payload', async () => {
  const request = {
    body: {},
    user: { accessToken: 'token-bulk' }
  };
  const response = new MockResponse();

  await bulkDeleteContacts(request, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, 'CONTACT_BULK_TARGET_REQUIRED');
  assert.equal(calls.bulkDelete.length, 1); // unchanged from previous success call
});
