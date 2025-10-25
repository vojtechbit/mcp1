import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADVANCED_DEBUG ||= '0';

const { normalizeRpcRequest } = await import('../src/middleware/rpcNormalizer.js');

function cloneBody(body) {
  if (body === null || body === undefined) {
    return body;
  }

  return JSON.parse(JSON.stringify(body));
}

function runMiddleware(body) {
  const req = { body: cloneBody(body) };
  const res = {};
  const nextCalls = [];

  const next = (err) => {
    nextCalls.push(err ?? null);
  };

  normalizeRpcRequest(req, res, next);

  return { req, nextCalls };
}

test('normalizeRpcRequest handles different payload shapes', async (t) => {
  await t.test('keeps already nested params requests as-is', () => {
    const input = { op: 'send', params: { to: 'root@example.com', subject: 'Hi' } };
    const { req, nextCalls } = runMiddleware(input);

    assert.deepStrictEqual(req.body, input);
    assert.equal(nextCalls.length, 1);
    assert.equal(nextCalls[0], null);
  });

  await t.test('wraps root-level params into params object', () => {
    const input = { op: 'send', to: 'root@example.com', subject: 'Hello' };
    const { req, nextCalls } = runMiddleware(input);

    assert.deepStrictEqual(req.body, {
      op: 'send',
      params: {
        to: 'root@example.com',
        subject: 'Hello'
      }
    });
    assert.equal(nextCalls.length, 1);
    assert.equal(nextCalls[0], null);
  });

  await t.test('merges root params over nested params', () => {
    const input = {
      op: 'send',
      params: {
        to: 'nested@example.com',
        body: 'Nested body'
      },
      to: 'root@example.com',
      subject: 'Root subject'
    };

    const { req, nextCalls } = runMiddleware(input);

    assert.deepStrictEqual(req.body, {
      op: 'send',
      params: {
        to: 'root@example.com',
        subject: 'Root subject',
        body: 'Nested body'
      }
    });
    assert.equal(nextCalls.length, 1);
    assert.equal(nextCalls[0], null);
  });

  await t.test('bulkDelete: wraps root params but leaves empty payload untouched', () => {
    const rootOnly = { op: 'bulkDelete', emails: ['a@example.com'], rowIds: ['123'] };
    const alreadyNested = { op: 'bulkDelete', params: { emails: ['b@example.com'] } };
    const emptyPayload = { op: 'bulkDelete' };

    const { req: wrappedReq, nextCalls: wrappedNext } = runMiddleware(rootOnly);
    assert.deepStrictEqual(wrappedReq.body, {
      op: 'bulkDelete',
      params: {
        emails: ['a@example.com'],
        rowIds: ['123']
      }
    });
    assert.equal(wrappedNext.length, 1);
    assert.equal(wrappedNext[0], null);

    const { req: nestedReq, nextCalls: nestedNext } = runMiddleware(alreadyNested);
    assert.deepStrictEqual(nestedReq.body, alreadyNested);
    assert.equal(nestedNext.length, 1);
    assert.equal(nestedNext[0], null);

    const { req: emptyReq, nextCalls: emptyNext } = runMiddleware(emptyPayload);
    assert.deepStrictEqual(emptyReq.body, emptyPayload);
    assert.equal(emptyNext.length, 1);
    assert.equal(emptyNext[0], null);
  });
});

test('normalizeRpcRequest passes through when op is missing', () => {
  const input = { params: { something: 'value' } };
  const { req, nextCalls } = runMiddleware(input);

  assert.deepStrictEqual(req.body, input);
  assert.equal(nextCalls.length, 1);
  assert.equal(nextCalls[0], null);
});
