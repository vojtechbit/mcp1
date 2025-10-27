import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
process.env.REDIRECT_URI = process.env.REDIRECT_URI || 'https://example.com/oauth';

async function setupOauthModule(tag) {
  const instances = [];
  let instanceCounter = 0;

  class FakeOAuth2 {
    constructor() {
      this.instanceId = ++instanceCounter;
      this.credentials = {};
      this.setCredentials = mock.fn((creds) => {
        this.credentials = { ...this.credentials, ...creds };
      });
      this.refreshAccessToken = mock.fn(async () => ({
        credentials: {
          access_token: `new-access-${this.instanceId}`,
          expiry_date: 1_700_000_000_000 + this.instanceId
        }
      }));
      this.getToken = mock.fn(async (code) => ({
        tokens: {
          access_token: `access-${code}-${this.instanceId}`,
          refresh_token: `refresh-${code}-${this.instanceId}`,
          expiry_date: 1_700_000_000_000 + this.instanceId
        }
      }));
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
});
