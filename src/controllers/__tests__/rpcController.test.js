import { test } from 'node:test';
import assert from 'node:assert/strict';

// Provide dummy OAuth env vars so importing services does not exit the process.
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
process.env.REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost/callback';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const bulkDeleteCalls = [];
const updateTaskCalls = [];

globalThis.__RPC_TEST_OVERRIDES = {
  contactsService: {
    bulkDelete: async (token, payload) => {
      bulkDeleteCalls.push({ token, payload });
      return { removed: (payload.rowIds || []).length, emails: payload.emails };
    }
  },
  tasksService: {
    updateTask: async (sub, taskListId, taskId, updates) => {
      updateTaskCalls.push({ sub, taskListId, taskId, updates });
      return { id: taskId, status: updates?.status || 'needsAction' };
    }
  }
};

const { contactsRpc, tasksRpc } = await import('../rpcController.js');
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

test('tasksRpc complete delegates to updateTask with completed status', async () => {
  updateTaskCalls.length = 0;
  const request = {
    body: {
      op: 'complete',
      params: { taskListId: 'list-1', taskId: 'task-9' }
    },
    user: { googleSub: 'user-42' }
  };
  const response = new MockResponse();

  await tasksRpc(request, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    data: { id: 'task-9', status: 'completed' }
  });
  assert.deepEqual(updateTaskCalls, [
    {
      sub: 'user-42',
      taskListId: 'list-1',
      taskId: 'task-9',
      updates: { status: 'completed' }
    }
  ]);
});

test('tasksRpc complete accepts root-level identifiers', async () => {
  updateTaskCalls.length = 0;
  const request = {
    body: {
      op: 'complete',
      taskListId: 'list-2',
      taskId: 'task-3'
    },
    user: { googleSub: 'user-99' }
  };
  const response = new MockResponse();

  await tasksRpc(request, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    data: { id: 'task-3', status: 'completed' }
  });
  assert.deepEqual(updateTaskCalls, [
    {
      sub: 'user-99',
      taskListId: 'list-2',
      taskId: 'task-3',
      updates: { status: 'completed' }
    }
  ]);
});
