import { test } from 'node:test';
import assert from 'node:assert/strict';

// Provide dummy OAuth env vars so importing services does not exit the process.
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
process.env.REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost/callback';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const bulkDeleteCalls = [];
const listTaskCalls = [];
const createDraftCalls = [];

globalThis.__RPC_TEST_OVERRIDES = {
  gmailService: {
    createDraft: async (sub, payload) => {
      createDraftCalls.push({ sub, payload });
      return { id: 'draft-123', message: { id: 'msg-456' } };
    }
  },
  contactsService: {
    bulkDelete: async (token, payload) => {
      bulkDeleteCalls.push({ token, payload });
      return { removed: (payload.rowIds || []).length, emails: payload.emails };
    }
  },
  tasksService: {
    listTasks: async (sub, params) => {
      listTaskCalls.push({ sub, params });
      return { items: [{ id: 'task-1' }], nextPageToken: null };
    }
  }
};

const { contactsRpc, tasksRpc, mailRpc } = await import('../rpcController.js');
delete globalThis.__RPC_TEST_OVERRIDES;

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

test('contactsRpc bulkDelete now returns migration error', async () => {
  bulkDeleteCalls.length = 0;
  const request = {
    body: {
      op: 'bulkDelete',
      params: { rowIds: [3, 5] }
    },
    user: { accessToken: 'token-123' }
  };
  const response = new MockResponse();

  await contactsRpc(request, response);

  assert.equal(response.statusCode, 410);
  assert.equal(response.body.code, 'CONTACTS_RPC_MUTATION_DISABLED');
  assert.deepEqual(response.body.endpoints, {
    update: '/api/contacts/actions/modify',
    delete: '/api/contacts/actions/delete',
    bulkDelete: '/api/contacts/actions/bulkDelete'
  });
  assert.equal(bulkDeleteCalls.length, 0);
});

test('contactsRpc bulkDelete root-level payload also returns migration error', async () => {
  bulkDeleteCalls.length = 0;
  const request = {
    body: {
      op: 'bulkDelete',
      rowIds: [7]
    },
    user: { accessToken: 'token-456' }
  };
  const response = new MockResponse();

  await contactsRpc(request, response);

  assert.equal(response.statusCode, 410);
  assert.equal(response.body.code, 'CONTACTS_RPC_MUTATION_DISABLED');
  assert.equal(bulkDeleteCalls.length, 0);
});

test('tasksRpc list delegates to tasksService listTasks', async () => {
  listTaskCalls.length = 0;
  const request = {
    body: {
      op: 'list',
      params: { maxResults: 5 }
    },
    user: { googleSub: 'user-42' }
  };
  const response = new MockResponse();

  await tasksRpc(request, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    data: { items: [{ id: 'task-1' }], nextPageToken: null }
  });
  assert.deepEqual(listTaskCalls, [
    {
      sub: 'user-42',
      params: { maxResults: 5 }
    }
  ]);
});

test('tasksRpc complete now returns migration error with hints', async () => {
  const request = {
    body: {
      op: 'complete',
      params: { taskListId: 'list-1', taskId: 'task-9' }
    },
    user: { googleSub: 'user-42' }
  };
  const response = new MockResponse();

  await tasksRpc(request, response);

  assert.equal(response.statusCode, 410);
  assert.equal(response.body.code, 'TASKS_RPC_MUTATION_DISABLED');
  assert.equal(response.body.hint.includes('status: "completed"'), true);
  assert.deepEqual(response.body.endpoints, {
    create: '/api/tasks/actions/create',
    modify: '/api/tasks/actions/modify',
    delete: '/api/tasks/actions/delete'
  });
});

test('tasksRpc create returns migration error using root level payloads', async () => {
  const request = {
    body: {
      op: 'create',
      title: 'New task'
    },
    user: { googleSub: 'user-77' }
  };
  const response = new MockResponse();

  await tasksRpc(request, response);

  assert.equal(response.statusCode, 410);
  assert.equal(response.body.code, 'TASKS_RPC_MUTATION_DISABLED');
  assert.equal(response.body.hint.includes('/tasks/actions/create'), true);
  assert.equal(listTaskCalls.length, 1); // unchanged from list test above
});

test('mailRpc createDraft creates draft via Gmail service', async () => {
  createDraftCalls.length = 0;
  const request = {
    body: {
      op: 'createDraft',
      params: {
        to: ' coworker@example.com ',
        subject: ' Weekly status ',
        body: 'Čau, posílám koncept meetingu.'
      }
    },
    user: { googleSub: 'user-sub-1' }
  };
  const response = new MockResponse();

  await mailRpc(request, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    data: { id: 'draft-123', message: { id: 'msg-456' } }
  });
  assert.deepEqual(createDraftCalls, [
    {
      sub: 'user-sub-1',
      payload: {
        to: 'coworker@example.com',
        subject: 'Weekly status',
        body: 'Čau, posílám koncept meetingu.'
      }
    }
  ]);
});

test('mailRpc createDraft rejects missing subject', async () => {
  createDraftCalls.length = 0;
  const request = {
    body: {
      op: 'createDraft',
      params: {
        to: 'coworker@example.com',
        body: 'Návrh zprávy'
      }
    },
    user: { googleSub: 'user-sub-2' }
  };
  const response = new MockResponse();

  await mailRpc(request, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, 'INVALID_PARAM');
  assert.match(response.body.message, /subject/);
  assert.equal(createDraftCalls.length, 0);
});
