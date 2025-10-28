import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
process.env.REDIRECT_URI = process.env.REDIRECT_URI || 'https://example.com/oauth';

async function setupOauthModule(tag, { getTokenImpl, refreshAccessTokenImpl } = {}) {
  const instances = [];
  let instanceCounter = 0;

  class FakeOAuth2 {
    constructor() {
      this.instanceId = ++instanceCounter;
      this.credentials = {};
      this.setCredentials = mock.fn((creds) => {
        this.credentials = { ...this.credentials, ...creds };
      });
      this.refreshAccessToken = mock.fn(async () => {
        if (refreshAccessTokenImpl) {
          return refreshAccessTokenImpl(this);
        }

        return {
          credentials: {
            access_token: `new-access-${this.instanceId}`,
            expiry_date: 1_700_000_000_000 + this.instanceId
          }
        };
      });
      this.getToken = mock.fn(async (code) => {
        if (getTokenImpl) {
          return getTokenImpl(code, this);
        }

        return {
          tokens: {
            access_token: `access-${code}-${this.instanceId}`,
            refresh_token: `refresh-${code}-${this.instanceId}`,
            expiry_date: 1_700_000_000_000 + this.instanceId
          }
        };
      });
      instances.push(this);
    }
  }

  const restoreGoogleMock = mock.module('googleapis', {
    namedExports: {
      google: {
        auth: {
          OAuth2: FakeOAuth2
        }
      }
    }
  });

  try {
    const module = await import(`../src/config/oauth.js?isolation=${Date.now()}-${tag}`);
    return { module, instances };
  } finally {
    restoreGoogleMock.restore();
  }
}

describe('OAuth client isolation', () => {
  it('creates independent OAuth2 clients for each call', async () => {
    const { module, instances } = await setupOauthModule('client');
    const { createOAuthClient } = module;

    const clientA = createOAuthClient();
    const clientB = createOAuthClient();

    assert.notStrictEqual(clientA, clientB, 'each factory call should return a new OAuth2 instance');
    assert.equal(instances.length, 2, 'factory should create one instance per invocation');

    clientA.setCredentials({ access_token: 'token-A' });

    assert.equal(clientB.credentials.access_token, undefined, 'second client must not reuse credentials from first');
    assert.equal(clientA.setCredentials.mock.callCount(), 1);
    assert.equal(clientB.setCredentials.mock.callCount(), 0);
  });

  it('uses fresh OAuth2 clients on every token refresh', async () => {
    const { module, instances } = await setupOauthModule('refresh');
    const { refreshAccessToken } = module;

    const refreshedOne = await refreshAccessToken('refresh-token-1');
    const refreshedTwo = await refreshAccessToken('refresh-token-2');

    assert.equal(instances.length, 2, 'each refresh must instantiate a separate OAuth2 client');

    const [firstClient, secondClient] = instances;

    assert.notStrictEqual(firstClient, secondClient, 'refresh calls cannot reuse the same OAuth2 client');
    assert.deepEqual(firstClient.credentials, { refresh_token: 'refresh-token-1' });
    assert.deepEqual(secondClient.credentials, { refresh_token: 'refresh-token-2' });

    assert.equal(firstClient.setCredentials.mock.callCount(), 1);
    assert.equal(secondClient.setCredentials.mock.callCount(), 1);

    assert.deepEqual(refreshedOne, {
      access_token: 'new-access-1',
      expiry_date: 1_700_000_000_001
    });
    assert.deepEqual(refreshedTwo, {
      access_token: 'new-access-2',
      expiry_date: 1_700_000_000_002
    });
  });

  it('exchanges authorization codes with isolated OAuth clients', async () => {
    const { module, instances } = await setupOauthModule('tokens');
    const { getTokensFromCode } = module;

    const tokensOne = await getTokensFromCode('alpha');
    const tokensTwo = await getTokensFromCode('beta');

    assert.equal(instances.length, 2, 'each token exchange must create a separate client');
    assert.deepEqual(tokensOne, {
      access_token: 'access-alpha-1',
      refresh_token: 'refresh-alpha-1',
      expiry_date: 1_700_000_000_001
    });
    assert.deepEqual(tokensTwo, {
      access_token: 'access-beta-2',
      refresh_token: 'refresh-beta-2',
      expiry_date: 1_700_000_000_002
    });
  });

  it('logs diagnostic context and rethrows OAuth exchange failures', async () => {
    const oauthError = new Error('invalid_grant');
    oauthError.code = 'oauth_error_code';
    const loggedErrors = [];
    const consoleMock = mock.method(console, 'error', (...args) => {
      loggedErrors.push(args);
    });

    try {
      const { module, instances } = await setupOauthModule('token-error', {
        getTokenImpl: async () => {
          throw oauthError;
        }
      });
      const { getTokensFromCode } = module;

      await assert.rejects(() => getTokensFromCode('faulty-code'), oauthError);

      assert.equal(instances.length, 1, 'failed exchange should still create exactly one client instance');
      assert.equal(loggedErrors.length, 2, 'should log the headline message and structured metadata');
      assert.equal(loggedErrors[0][0], '❌ [OAUTH_ERROR] Failed to exchange authorization code for tokens');

      const [label, metadata] = loggedErrors[1];
      assert.equal(label, 'Details:');
      assert.equal(metadata.errorMessage, 'invalid_grant');
      assert.equal(metadata.code, 'oauth_error_code');
      assert.match(metadata.timestamp, /\d{4}-\d{2}-\d{2}T/);
    } finally {
      consoleMock.mock.restore();
    }
  });
});
