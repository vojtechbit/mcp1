import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module('dotenv', { defaultExport: { config: () => ({}) } });

const originalSetTimeout = globalThis.setTimeout;
const originalSetInterval = globalThis.setInterval;

globalThis.setTimeout = (fn, delay, ...args) => {
  const timer = originalSetTimeout(fn, delay, ...args);
  if (typeof timer?.unref === 'function') {
    timer.unref();
  }
  return timer;
};

globalThis.setInterval = (fn, delay, ...args) => {
  const timer = originalSetInterval(fn, delay, ...args);
  if (typeof timer?.unref === 'function') {
    timer.unref();
  }
  return timer;
};

const snapshotStore = await import(new URL('../src/utils/snapshotStore.js', import.meta.url).href);
const performanceLogger = await import(new URL('../src/utils/performanceLogger.js', import.meta.url).href);
const errorsUtil = await import(new URL('../src/utils/errors.js', import.meta.url).href);
const redactUtil = await import(new URL('../src/utils/redact.js', import.meta.url).href);
const limits = await import(new URL('../src/config/limits.js', import.meta.url).href);

test.after(() => {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.setInterval = originalSetInterval;
});

test('snapshotStore creates and retrieves snapshots with cleanup', async () => {
  const token = snapshotStore.createSnapshot('query', { flag: true });
  const snapshot = snapshotStore.getSnapshot(token);
  assert.equal(snapshot.query, 'query');
  snapshot.timestamp = Date.now() - (limits.SNAPSHOT_TTL_MS + 1000);
  snapshotStore.cleanupExpiredSnapshots();
  assert.equal(snapshotStore.getSnapshot(token), null);
});

test('snapshotStore diagnostics reflect active entries', () => {
  const token = snapshotStore.createSnapshot('diag', { count: 1 });
  const diagnostics = snapshotStore.getSnapshotDiagnostics();
  assert.ok(diagnostics.active >= 1);
  snapshotStore.clearSnapshots();
  assert.equal(snapshotStore.getSnapshot(token), null);
});

test('performanceLogger logs duration and times async operations', async () => {
  const logSpy = mock.method(console, 'log', () => {});
  const timer = performanceLogger.startTimer();
  const duration = performanceLogger.logDuration('metric.test', timer, { status: 'success', info: 123 });
  assert.ok(duration >= 0);
  assert.ok(logSpy.mock.calls.some(call => call.arguments[0]?.includes('metric.test')));
  logSpy.mock.restore();

  const asyncSpy = mock.method(console, 'log', () => {});
  const result = await performanceLogger.timeAsync('metric.async', async () => 42);
  assert.equal(result, 42);
  assert.ok(asyncSpy.mock.calls.some(call => call.arguments[0]?.includes('metric.async')));
  asyncSpy.mock.restore();
});

test('performanceLogger.timeAsync propagates errors while logging', async () => {
  const logSpy = mock.method(console, 'log', () => {});
  await assert.rejects(() => performanceLogger.timeAsync('metric.fail', async () => { throw new Error('boom'); }));
  assert.ok(logSpy.mock.calls.some(call => call.arguments[0]?.includes('metric.fail')));
  logSpy.mock.restore();
});

test('ApiError.from extracts HTTP response details', () => {
  const error = errorsUtil.ApiError.from({ response: { status: 401, data: { error: 'auth', message: 'fail', code: 'E401' } } });
  assert.equal(error.statusCode, 401);
  assert.equal(error.code, 'E401');
  assert.equal(error.message, 'fail');
});

test('handleControllerError returns structured response', () => {
  const res = { statusCode: null, payload: null, status(code) { this.statusCode = code; return this; }, json(data) { this.payload = data; return this; } };
  errorsUtil.handleControllerError(res, new Error('oops'), { context: 'test', defaultMessage: 'Default error' });
  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.error, 'Internal Server Error');
  assert.ok(res.payload.message.includes('Default error'));
});

test('handleControllerError preserves ApiError code and details', () => {
  const customError = new errorsUtil.ApiError('Task update failed', {
    statusCode: 409,
    code: 'TASK_UPDATE_FAILED',
    details: { taskId: 'task-123' }
  });

  const res = { statusCode: null, payload: null, status(code) { this.statusCode = code; return this; }, json(data) { this.payload = data; return this; } };

  errorsUtil.handleControllerError(res, customError, { context: 'tasks.createTask', defaultMessage: 'Task creation failed' });

  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.error, 'Conflict');
  assert.equal(res.payload.code, 'TASK_UPDATE_FAILED');
  assert.deepEqual(res.payload.details, { taskId: 'task-123' });
  assert.equal(res.payload.message, 'Task update failed');
});

test('handleControllerError surfaces response-derived code and details', () => {
  const apiResponseError = {
    response: {
      status: 422,
      data: {
        error: 'Validation Failed',
        message: 'Missing required field: title',
        code: 'TASK_TITLE_REQUIRED',
        details: { field: 'title' }
      }
    }
  };

  const res = { statusCode: null, payload: null, status(code) { this.statusCode = code; return this; }, json(data) { this.payload = data; return this; } };

  errorsUtil.handleControllerError(res, apiResponseError, { context: 'tasks.createTask', defaultMessage: 'Task creation failed' });

  assert.equal(res.statusCode, 422);
  assert.equal(res.payload.error, 'Unprocessable Entity');
  assert.equal(res.payload.code, 'TASK_TITLE_REQUIRED');
  assert.deepEqual(res.payload.details, { field: 'title' });
  assert.equal(res.payload.message, 'Missing required field: title');
});

test('redact utilities mask secrets and sensitive keys', () => {
  const summarized = redactUtil.summarizeSecret('abcdefghijklmnopqrstuvwxyz');
  assert.ok(summarized.startsWith('abcd'));
  const sanitized = redactUtil.sanitizeForLog({ token: 'secret-value', nested: { password: 'abc12345' }, text: 'short' });
  assert.ok(sanitized.token.includes('len='));
  assert.notEqual(sanitized.token, 'secret-value');
  assert.equal(sanitized.nested.password.includes('[redacted]'), true);
  assert.equal(sanitized.text, 'short');
});
