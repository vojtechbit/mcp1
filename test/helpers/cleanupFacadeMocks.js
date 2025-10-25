import { afterEach } from 'node:test';

afterEach(() => {
  if ('__facadeMocks' in globalThis) {
    delete globalThis.__facadeMocks;
  }
});
