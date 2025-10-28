import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const databaseModulePath = new URL('../src/config/database.js', import.meta.url).href;
const tokenIdentityServicePath = new URL('../src/services/tokenIdentityService.js', import.meta.url).href;
const proxyTokenServicePath = new URL('../src/services/proxyTokenService.js', import.meta.url).href;

const databaseState = { collection: null };

mock.module(databaseModulePath, {
  namedExports: {
    getDatabase: async () => ({
      collection: () => databaseState.collection
    })
  }
});

mock.module(tokenIdentityServicePath, {
  namedExports: {
    cacheAccessTokenIdentity: mock.fn(async () => {}),
    getCachedIdentityForAccessToken: mock.fn(async () => null),
    invalidateCachedIdentity: mock.fn(async () => {}),
    purgeIdentitiesForGoogleSub: mock.fn(async () => {})
  }
});

mock.module(proxyTokenServicePath, {
  namedExports: {
    findUserByProxyToken: mock.fn(async () => null)
  }
});

mock.module('dotenv', { defaultExport: { config: () => ({}) } });

const authMiddleware = await import(new URL('../src/middleware/authMiddleware.js', import.meta.url).href);
const errorHandlerModule = await import(new URL('../src/middleware/errorHandler.js', import.meta.url).href);
const contactsNormalizerModule = await import(new URL('../src/middleware/contactsNormalizer.js', import.meta.url).href);
const idempotencyModule = await import(new URL('../src/middleware/idempotencyMiddleware.js', import.meta.url).href);

test('authMiddleware.verifyToken rejects missing authorization header', async () => {
  const res = { statusCode: null, payload: null, status(code) { this.statusCode = code; return this; }, json(data) { this.payload = data; return this; } };
  await authMiddleware.verifyToken({ headers: {} }, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.ok(res.payload.message.includes('authorization token'));
});

test('errorHandler converts errors into JSON payload', () => {
  const { errorHandler } = errorHandlerModule;
  const res = { statusCode: null, payload: null, status(code) { this.statusCode = code; return this; }, json(data) { this.payload = data; return this; } };
  errorHandler(new Error('Boom'), { method: 'GET', path: '/test', user: { email: 'user@example.com' } }, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.error, 'Internal Server Error');
});

test('notFoundHandler returns 404 for unmatched route', () => {
  const { notFoundHandler } = errorHandlerModule;
  const res = { statusCode: null, payload: null, status(code) { this.statusCode = code; return this; }, json(data) { this.payload = data; return this; } };
  notFoundHandler({ method: 'GET', path: '/missing' }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.error, 'Not Found');
});

test('asyncHandler propagates rejected promise to next', async () => {
  const { asyncHandler } = errorHandlerModule;
  const error = new Error('fail');
  const nextSpy = mock.fn();
  await new Promise((resolve) => {
    asyncHandler(async () => { throw error; })({}, {}, (err) => {
      nextSpy(err);
      resolve();
    });
  });
  assert.equal(nextSpy.mock.calls[0].arguments[0], error);
});

test('contactsNormalizer trims contact payloads for RPC requests', async () => {
  const { normalizeContactsRequest } = contactsNormalizerModule;
  const req = { path: '/rpc/contacts/add', method: 'POST', body: { op: 'add', params: { name: '  Alice  ', email: '  alice@example.com  ' } } };
  await new Promise((resolve) => {
    normalizeContactsRequest(req, {}, resolve);
  });
  assert.equal(req.body.params.name, 'Alice');
  assert.equal(req.body.params.email, 'alice@example.com');
});

test('initializeIdempotencyIndexes creates required indexes once', async () => {
  const collection = {
    createIndex: mock.fn(async () => {})
  };
  databaseState.collection = collection;
  await idempotencyModule.initializeIdempotencyIndexes();
  assert.equal(collection.createIndex.mock.calls.length, 2);
});

test('idempotencyMiddleware stores response for first request', async () => {
  const collection = {
    findOne: mock.fn(async () => null),
    updateOne: mock.fn(async () => {})
  };
  databaseState.collection = collection;
  const req = {
    method: 'POST',
    path: '/api/test',
    headers: { 'idempotency-key': 'abc123' },
    body: { value: 1 }
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.payload = data; return this; }
  };
  const nextSpy = mock.fn(() => {
    res.status(201);
    res.json({ ok: true });
  });

  await idempotencyModule.idempotencyMiddleware(req, res, nextSpy);
  assert.equal(nextSpy.mock.calls.length, 1);
  assert.equal(collection.updateOne.mock.calls.length, 1);
  assert.equal(res.payload.ok, true);
});

test('idempotencyMiddleware rejects conflicting reuse', async () => {
  const collection = {
    findOne: mock.fn(async () => ({ fingerprint: 'different', status: 200, body: { ok: true } })),
    updateOne: mock.fn(async () => {})
  };
  databaseState.collection = collection;
  const req = {
    method: 'POST',
    path: '/api/test',
    headers: { 'idempotency-key': 'abc123' },
    body: { value: 1 }
  };
  const res = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.payload = data; return this; }
  };

  await idempotencyModule.idempotencyMiddleware(req, res, () => {});
  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.error, 'Idempotency key reuse mismatch');
});

test('cleanupExpiredRecords returns count of removed documents', async () => {
  const collection = {
    deleteMany: mock.fn(async () => ({ deletedCount: 3 }))
  };
  databaseState.collection = collection;
  const removed = await idempotencyModule.cleanupExpiredRecords();
  assert.equal(removed, 3);
});
