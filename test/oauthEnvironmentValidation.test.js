import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

const REQUIRED_ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'REDIRECT_URI'];

function snapshotEnv(keys) {
  return keys.reduce((acc, key) => {
    acc[key] = process.env[key];
    return acc;
  }, {});
}

function restoreEnv(keys, snapshot) {
  for (const key of keys) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

describe('OAuth environment validation', () => {
  it('terminates the process when required credentials are missing', async () => {
    const envSnapshot = snapshotEnv(REQUIRED_ENV_KEYS);
    for (const key of REQUIRED_ENV_KEYS) {
      delete process.env[key];
    }

    const exitError = new Error('process.exit intercepted');
    const exitMock = mock.method(process, 'exit', () => {
      throw exitError;
    });

    const logged = [];
    const errorMock = mock.method(console, 'error', (message) => {
      logged.push(message);
    });

    try {
      await assert.rejects(
        () => import(`../src/config/oauth.js?missing=${Date.now()}`),
        exitError
      );

      assert.equal(exitMock.mock.callCount(), 1, 'process.exit should be invoked exactly once');
      assert.deepEqual(exitMock.mock.calls[0].arguments, [1]);
      assert.deepEqual(logged, [
        '❌ Missing required Google OAuth credentials in .env:',
        '  - GOOGLE_CLIENT_ID',
        '  - GOOGLE_CLIENT_SECRET',
        '  - REDIRECT_URI'
      ]);
    } finally {
      restoreEnv(REQUIRED_ENV_KEYS, envSnapshot);
      exitMock.mock.restore();
      errorMock.mock.restore();
    }
  });

  it('loads credentials via dotenv and wires them into the OAuth client', async () => {
    const envSnapshot = snapshotEnv(REQUIRED_ENV_KEYS);
    for (const key of REQUIRED_ENV_KEYS) {
      delete process.env[key];
    }

    const examplePath = path.join(process.cwd(), '.env.example');
    const envContent = await readFile(examplePath, 'utf8');
    const parsed = dotenv.parse(envContent);

    const injectedCredentials = {
      GOOGLE_CLIENT_ID: `test-${parsed.GOOGLE_CLIENT_ID || 'client-id'}`,
      GOOGLE_CLIENT_SECRET: `test-${parsed.GOOGLE_CLIENT_SECRET || 'client-secret'}`,
      REDIRECT_URI: parsed.REDIRECT_URI || 'http://localhost:3000/oauth/callback'
    };

    const createdClients = [];
    class FakeOAuth2 {
      constructor(clientId, clientSecret, redirectUri) {
        this.generateAuthUrl = mock.fn(({ access_type, scope, prompt, state, include_granted_scopes }) => {
          this.lastOptions = { access_type, scope, prompt, state, include_granted_scopes };
          return `https://example.test/oauth?state=${state}`;
        });
        createdClients.push({ clientId, clientSecret, redirectUri, instance: this });
      }
    }
    Object.assign(process.env, injectedCredentials);

    const restoreGoogle = mock.module('googleapis', {
      namedExports: {
        google: {
          auth: {
            OAuth2: FakeOAuth2
          }
        }
      }
    });

    try {
      const oauthModule = await import(`../src/config/oauth.js?dotenv=${Date.now()}`);
      const { getAuthUrl, SCOPES } = oauthModule;

      const url = getAuthUrl('state-123');

      assert.equal(createdClients.length, 1, 'should create exactly one OAuth2 client for auth URL generation');
      const [{ clientId, clientSecret, redirectUri, instance }] = createdClients;
      assert.deepEqual(
        { clientId, clientSecret, redirectUri },
        {
          clientId: injectedCredentials.GOOGLE_CLIENT_ID,
          clientSecret: injectedCredentials.GOOGLE_CLIENT_SECRET,
          redirectUri: injectedCredentials.REDIRECT_URI
        }
      );

      assert.equal(instance.generateAuthUrl.mock.callCount(), 1);
      assert.deepEqual(instance.lastOptions.scope, SCOPES, 'scopes passed to generateAuthUrl should match module export');
      assert.equal(instance.lastOptions.access_type, 'offline');
      assert.equal(instance.lastOptions.prompt, 'consent');
      assert.equal(instance.lastOptions.include_granted_scopes, true);
      assert.equal(instance.lastOptions.state, 'state-123');
      assert.equal(url, 'https://example.test/oauth?state=state-123');

    } finally {
      restoreEnv(REQUIRED_ENV_KEYS, envSnapshot);
      restoreGoogle.restore();
    }
  });
});
