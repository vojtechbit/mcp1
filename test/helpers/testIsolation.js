import { before, beforeEach, afterEach, after, mock } from 'node:test';

let originalEnvSnapshot = null;
let originalEnvKeys = null;

before(() => {
  originalEnvSnapshot = Object.freeze({ ...process.env });
  originalEnvKeys = new Set(Object.keys(process.env));

  process.env.NODE_ENV = 'test';

  if ('__facadeMocks' in globalThis) {
    delete globalThis.__facadeMocks;
  }
});

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  if ('__facadeMocks' in globalThis) {
    delete globalThis.__facadeMocks;
  }
});

afterEach(() => {
  mock.restoreAll();

  if ('__facadeMocks' in globalThis) {
    delete globalThis.__facadeMocks;
  }

  process.env.NODE_ENV = 'test';
});

after(() => {
  mock.restoreAll();

  if ('__facadeMocks' in globalThis) {
    delete globalThis.__facadeMocks;
  }

  if (!originalEnvSnapshot || !originalEnvKeys) {
    return;
  }

  for (const key of Object.keys(process.env)) {
    if (!originalEnvKeys.has(key)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(originalEnvSnapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});
