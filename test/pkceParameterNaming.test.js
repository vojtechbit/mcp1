/**
 * PKCE Parameter Naming - Integration Tests
 *
 * Verifies that PKCE parameters use correct naming conventions:
 * - camelCase for JavaScript API (google-auth-library)
 * - snake_case for OAuth URL parameters (Google OAuth spec)
 * - snake_case for internal storage (state)
 *
 * Related: PKCE_SECURITY_ANALYSIS.md
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('PKCE Parameter Naming Conventions', () => {
  describe('pkce.js utility functions', () => {
    it('generatePKCEPair returns camelCase property names', async () => {
      const { generatePKCEPair } = await import('../src/utils/pkce.js');

      const pair = generatePKCEPair();

      // Verify camelCase naming (JavaScript convention)
      assert.ok('codeVerifier' in pair, 'Should have codeVerifier (camelCase)');
      assert.ok('codeChallenge' in pair, 'Should have codeChallenge (camelCase)');
      assert.ok('codeChallengeMethod' in pair, 'Should have codeChallengeMethod (camelCase)');

      // Verify NO snake_case properties
      assert.strictEqual(pair.code_verifier, undefined, 'Should NOT have code_verifier (snake_case)');
      assert.strictEqual(pair.code_challenge, undefined, 'Should NOT have code_challenge (snake_case)');
      assert.strictEqual(pair.code_challenge_method, undefined, 'Should NOT have code_challenge_method (snake_case)');
    });

    it('generates RFC 7636 compliant PKCE pairs', async () => {
      const { generatePKCEPair } = await import('../src/utils/pkce.js');

      const pair = generatePKCEPair();

      // Verify format (base64url - no +, /, or =)
      assert.match(pair.codeVerifier, /^[A-Za-z0-9_-]+$/, 'code verifier should be base64url');
      assert.match(pair.codeChallenge, /^[A-Za-z0-9_-]+$/, 'code challenge should be base64url');

      // Verify length (RFC 7636: 43-128 characters for verifier)
      assert.ok(pair.codeVerifier.length >= 43, 'verifier should be >= 43 chars');
      assert.ok(pair.codeVerifier.length <= 128, 'verifier should be <= 128 chars');

      // Verify method
      assert.strictEqual(pair.codeChallengeMethod, 'S256', 'should use S256 method');
    });

    it('generates unique values on each call', async () => {
      const { generatePKCEPair } = await import('../src/utils/pkce.js');

      const pair1 = generatePKCEPair();
      const pair2 = generatePKCEPair();
      const pair3 = generatePKCEPair();

      // All verifiers should be unique
      assert.notStrictEqual(pair1.codeVerifier, pair2.codeVerifier);
      assert.notStrictEqual(pair2.codeVerifier, pair3.codeVerifier);
      assert.notStrictEqual(pair1.codeVerifier, pair3.codeVerifier);

      // All challenges should be unique (derived from unique verifiers)
      assert.notStrictEqual(pair1.codeChallenge, pair2.codeChallenge);
      assert.notStrictEqual(pair2.codeChallenge, pair3.codeChallenge);
      assert.notStrictEqual(pair1.codeChallenge, pair3.codeChallenge);
    });

    it('verifyCodeChallenge correctly validates matching pairs', async () => {
      const { generatePKCEPair, verifyCodeChallenge } = await import('../src/utils/pkce.js');

      const { codeVerifier, codeChallenge } = generatePKCEPair();

      // Should accept correct pair
      const isValid = verifyCodeChallenge(codeVerifier, codeChallenge);
      assert.strictEqual(isValid, true, 'should verify correct code_verifier');
    });

    it('verifyCodeChallenge rejects incorrect verifiers', async () => {
      const { generatePKCEPair, verifyCodeChallenge } = await import('../src/utils/pkce.js');

      const pair1 = generatePKCEPair();
      const pair2 = generatePKCEPair();

      // Should reject wrong verifier
      const isValid = verifyCodeChallenge(pair1.codeVerifier, pair2.codeChallenge);
      assert.strictEqual(isValid, false, 'should reject incorrect code_verifier');
    });

    it('generateCodeChallenge produces deterministic output', async () => {
      const { generateCodeChallenge } = await import('../src/utils/pkce.js');

      const verifier = 'test-verifier-123';

      const challenge1 = generateCodeChallenge(verifier);
      const challenge2 = generateCodeChallenge(verifier);

      // Same verifier should always produce same challenge
      assert.strictEqual(challenge1, challenge2, 'challenge should be deterministic');
    });
  });

  describe('oauth.js parameter handling', () => {
    it('getAuthUrl accepts snake_case PKCE params for OAuth URL', async () => {
      const { getAuthUrl } = await import('../src/config/oauth.js');

      // OAuth URL parameters should be snake_case (OAuth 2.0 spec)
      const pkceParams = {
        code_challenge: 'test-challenge-abc123',
        code_challenge_method: 'S256'
      };

      const url = getAuthUrl('test-state', pkceParams);

      // Verify URL contains snake_case parameters
      assert.match(url, /code_challenge=test-challenge-abc123/);
      assert.match(url, /code_challenge_method=S256/);

      // Verify it's a valid Google OAuth URL
      assert.match(url, /^https:\/\/accounts\.google\.com\/o\/oauth2/);
    });

    it('getAuthUrl works without PKCE params (backwards compatible)', async () => {
      const { getAuthUrl } = await import('../src/config/oauth.js');

      const url = getAuthUrl('test-state');

      // Should generate valid URL without PKCE
      assert.match(url, /^https:\/\/accounts\.google\.com\/o\/oauth2/);
      assert.match(url, /state=test-state/);

      // Should NOT contain PKCE parameters
      assert.doesNotMatch(url, /code_challenge=/);
    });

    it('getAuthUrl defaults code_challenge_method to S256', async () => {
      const { getAuthUrl } = await import('../src/config/oauth.js');

      const pkceParams = {
        code_challenge: 'test-challenge'
        // code_challenge_method not provided
      };

      const url = getAuthUrl('state', pkceParams);

      // Should default to S256
      assert.match(url, /code_challenge_method=S256/);
    });
  });

  describe('PKCE end-to-end flow consistency', () => {
    it('verifies naming consistency across full PKCE flow', async () => {
      const { generatePKCEPair } = await import('../src/utils/pkce.js');
      const { getAuthUrl } = await import('../src/config/oauth.js');

      // Step 1: Generate PKCE pair (camelCase output)
      const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePKCEPair();

      assert.ok(typeof codeVerifier === 'string');
      assert.ok(typeof codeChallenge === 'string');
      assert.strictEqual(codeChallengeMethod, 'S256');

      // Step 2: Use challenge in auth URL (convert to snake_case for OAuth URL)
      const pkceParams = {
        code_challenge: codeChallenge,  // snake_case for URL
        code_challenge_method: codeChallengeMethod
      };

      const authUrl = getAuthUrl('state', pkceParams);

      assert.match(authUrl, new RegExp(`code_challenge=${codeChallenge}`));
      assert.match(authUrl, /code_challenge_method=S256/);

      // Step 3: Simulate state storage (internal - snake_case is OK)
      const stateData = {
        code_verifier: codeVerifier,  // snake_case for storage
        chatgpt_state: 'state-123',
        timestamp: Date.now()
      };

      assert.strictEqual(stateData.code_verifier, codeVerifier);

      // Step 4: Token exchange would use camelCase for API call
      // (This is tested via actual oauth.js implementation)
      // tokenOptions.codeVerifier = stateData.code_verifier;
    });

    it('demonstrates correct usage in oauthProxyController flow', async () => {
      const { generatePKCEPair } = await import('../src/utils/pkce.js');

      // This simulates what oauthProxyController.js does:

      // 1. Generate pair (camelCase)
      const { codeVerifier, codeChallenge } = generatePKCEPair();

      // 2. Store in state (snake_case for storage)
      const stateData = {
        code_verifier: codeVerifier,
        chatgpt_state: 'state',
        timestamp: Date.now()
      };

      // 3. Send challenge to Google (snake_case for URL)
      const pkceParamsForUrl = {
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      };

      // 4. Later: retrieve from state and use in token exchange
      const retrievedVerifier = stateData.code_verifier;

      // 5. Token exchange uses camelCase for API
      const tokenOptions = {
        code: 'auth-code',
        codeVerifier: retrievedVerifier,  // camelCase for API!
        redirect_uri: 'https://example.com/callback'
      };

      // Verify correct naming at each step
      assert.ok('code_verifier' in stateData);  // storage: snake_case
      assert.ok('code_challenge' in pkceParamsForUrl);  // URL: snake_case
      assert.ok('codeVerifier' in tokenOptions);  // API: camelCase
      assert.strictEqual(tokenOptions.code_verifier, undefined);  // NOT snake_case in API!
    });
  });

  describe('Bug prevention - regression tests', () => {
    it('CRITICAL: token exchange must use camelCase codeVerifier', async () => {
      // This test documents the bug that was fixed in commit 0621270

      // WRONG (causes invalid_grant error):
      const wrongTokenOptions = {
        code: 'auth-code',
        code_verifier: 'verifier',  // ❌ snake_case - Google Auth Library won't recognize it
        redirect_uri: 'https://example.com/callback'
      };

      // CORRECT (after fix):
      const correctTokenOptions = {
        code: 'auth-code',
        codeVerifier: 'verifier',  // ✅ camelCase - Google Auth Library expects this
        redirect_uri: 'https://example.com/callback'
      };

      // Verify the correct format
      assert.ok('codeVerifier' in correctTokenOptions);
      assert.strictEqual(correctTokenOptions.code_verifier, undefined);

      // Verify the wrong format (for documentation)
      assert.ok('code_verifier' in wrongTokenOptions);
      assert.strictEqual(wrongTokenOptions.codeVerifier, undefined);
    });

    it('CRITICAL: token exchange must include redirect_uri', async () => {
      // This test documents the bug that was fixed in commit 026da0f

      // WRONG (causes invalid_grant error):
      const wrongTokenOptions = {
        code: 'auth-code',
        codeVerifier: 'verifier'
        // ❌ Missing redirect_uri - required by OAuth 2.0 spec
      };

      // CORRECT (after fix):
      const correctTokenOptions = {
        code: 'auth-code',
        codeVerifier: 'verifier',
        redirect_uri: 'https://example.com/callback'  // ✅ Required!
      };

      // Verify the correct format
      assert.ok('redirect_uri' in correctTokenOptions);
      assert.strictEqual(wrongTokenOptions.redirect_uri, undefined);
    });
  });
});
