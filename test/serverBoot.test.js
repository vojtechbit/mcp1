import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const serverModulePath = new URL('../src/server.js', import.meta.url).href;

const limitsModulePath = new URL('../src/config/limits.js', import.meta.url).href;
const databaseModulePath = new URL('../src/config/database.js', import.meta.url).href;
const backgroundRefreshModulePath = new URL('../src/services/backgroundRefreshService.js', import.meta.url).href;
const idempotencyModulePath = new URL('../src/middleware/idempotencyMiddleware.js', import.meta.url).href;
const authRoutesModulePath = new URL('../src/routes/authRoutes.js', import.meta.url).href;
const apiRoutesModulePath = new URL('../src/routes/apiRoutes.js', import.meta.url).href;
const facadeRoutesModulePath = new URL('../src/routes/facadeRoutes.js', import.meta.url).href;
const oauthProxyRoutesModulePath = new URL('../src/routes/oauthProxyRoutes.js', import.meta.url).href;
const privacyRoutesModulePath = new URL('../src/routes/privacyRoutes.js', import.meta.url).href;
const debugRoutesModulePath = new URL('../src/routes/debugRoutes.js', import.meta.url).href;
const errorHandlerModulePath = new URL('../src/middleware/errorHandler.js', import.meta.url).href;

const stubRouter = (label) => Object.assign((req, res, next) => next && next(), { label });

test('server wires middleware, routes, and startup hooks', async (t) => {
  process.env.PORT = '4455';
  process.env.ENABLE_BACKGROUND_REFRESH = 'true';
  process.env.RL_MAX_PER_IP = '50';
  process.env.RL_MAX_HEAVY_PER_IP = '5';
  process.env.RL_MAX_OAUTH_PER_IP = '7';

  const listenSpy = mock.fn((port, callback) => {
    if (callback) callback();
    return { close: () => {} };
  });
  const getCalls = new Map();
  const useCalls = [];

  const expressApp = {
    set: mock.fn(),
    use: mock.fn((...args) => {
      useCalls.push(args);
      return expressApp;
    }),
    get: mock.fn((path, handler) => {
      getCalls.set(path, handler);
      return expressApp;
    }),
    listen: listenSpy
  };

  const jsonMiddleware = () => {};
  const urlencodedMiddleware = () => {};
  const expressStub = Object.assign(() => expressApp, {
    json: () => jsonMiddleware,
    urlencoded: () => urlencodedMiddleware
  });
  mock.module('express', { defaultExport: expressStub });
  mock.module('cors', { defaultExport: () => 'cors-middleware' });
  mock.module('helmet', { defaultExport: () => 'helmet-middleware' });

  const rateLimitFactoryCalls = [];
  mock.module('express-rate-limit', {
    defaultExport: (options) => {
      rateLimitFactoryCalls.push(options);
      const fn = mock.fn((req, res, next) => next && next());
      fn.options = options;
      return fn;
    }
  });

  mock.module('dotenv', { defaultExport: { config: () => ({}) } });

  const connectToDatabaseMock = mock.fn(async () => {});
  mock.module(databaseModulePath, {
    namedExports: {
      connectToDatabase: connectToDatabaseMock
    }
  });

  const refreshAllTokensOnStartupMock = mock.fn(async () => {});
  const startBackgroundRefreshMock = mock.fn();
  mock.module(backgroundRefreshModulePath, {
    namedExports: {
      refreshAllTokensOnStartup: refreshAllTokensOnStartupMock,
      startBackgroundRefresh: startBackgroundRefreshMock
    }
  });

  const initializeIdempotencyIndexesMock = mock.fn(async () => {});
  mock.module(idempotencyModulePath, {
    namedExports: {
      initializeIdempotencyIndexes: initializeIdempotencyIndexesMock
    }
  });

  mock.module(limitsModulePath, {
    namedExports: {
      RL_MAX_PER_IP: 123,
      RL_MAX_HEAVY_PER_IP: 45,
      RL_MAX_OAUTH_PER_IP: 6
    }
  });

  mock.module(authRoutesModulePath, { defaultExport: stubRouter('auth') });
  mock.module(apiRoutesModulePath, { defaultExport: stubRouter('api') });
  mock.module(facadeRoutesModulePath, { defaultExport: stubRouter('facade') });
  mock.module(oauthProxyRoutesModulePath, { defaultExport: stubRouter('oauth') });
  mock.module(privacyRoutesModulePath, { defaultExport: stubRouter('privacy') });
  mock.module(debugRoutesModulePath, { defaultExport: stubRouter('debug') });

  function errorHandlerStub(err, req, res, next) { if (next) next(err); }
  function notFoundHandlerStub(req, res, next) { if (next) next(); }
  mock.module(errorHandlerModulePath, {
    namedExports: {
      errorHandler: errorHandlerStub,
      notFoundHandler: notFoundHandlerStub
    }
  });

  const { heavyLimiter } = await import(serverModulePath);

  assert.equal(expressApp.set.mock.calls.at(-1).arguments[0], 'trust proxy');
  assert.ok(rateLimitFactoryCalls.length >= 3, 'creates rate limiters for standard, heavy, oauth');
  assert.equal(typeof heavyLimiter, 'function');
  assert.equal(Number(listenSpy.mock.calls[0].arguments[0]), 4455);
  assert.equal(connectToDatabaseMock.mock.calls.length, 1);
  assert.equal(refreshAllTokensOnStartupMock.mock.calls.length, 1);
  assert.equal(startBackgroundRefreshMock.mock.calls.length, 1);
  assert.equal(initializeIdempotencyIndexesMock.mock.calls.length, 1);

  const healthHandler = getCalls.get('/health');
  assert.equal(typeof healthHandler, 'function');
  const fakeRes = { jsonPayload: null, json(data) { this.jsonPayload = data; } };
  await healthHandler({}, fakeRes);
  assert.equal(fakeRes.jsonPayload.status, 'healthy');

  const mountedLabels = useCalls.flatMap(args => args.filter((arg) => typeof arg === 'function' && arg.label).map(arg => arg.label));
  assert.deepEqual(new Set(mountedLabels), new Set(['oauth', 'privacy', 'auth', 'api', 'facade', 'debug']));
});
