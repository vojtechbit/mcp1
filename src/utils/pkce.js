/**
 * PKCE (Proof Key for Code Exchange) Utility
 *
 * Implements RFC 7636 for secure OAuth 2.0 authorization code flow
 * Prevents authorization code interception attacks
 */

import crypto from 'crypto';
import { wrapModuleFunctions } from './advancedDebugging.js';

/**
 * Generate a cryptographically random code verifier
 * Length: 43-128 characters (RFC 7636 requirement)
 *
 * @param {number} [length=64] - Length of verifier (43-128)
 * @returns {string} URL-safe base64 encoded string
 */
function generateCodeVerifier(length = 64) {
  if (length < 43 || length > 128) {
    throw new Error('Code verifier length must be between 43 and 128');
  }

  // Generate random bytes (3/4 of desired length due to base64 encoding)
  const randomBytes = crypto.randomBytes(Math.ceil(length * 3 / 4));

  // Base64URL encode and trim to exact length
  return base64URLEncode(randomBytes).substring(0, length);
}

/**
 * Generate code challenge from code verifier
 * Uses S256 method (SHA-256 hash)
 *
 * @param {string} codeVerifier - Code verifier string
 * @returns {string} Base64URL encoded SHA-256 hash
 */
function generateCodeChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return base64URLEncode(hash);
}

/**
 * Base64URL encode (RFC 4648 Section 5)
 * URL-safe variant without padding
 *
 * @param {Buffer} buffer - Buffer to encode
 * @returns {string} Base64URL encoded string
 */
function base64URLEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Verify code verifier against code challenge
 * Used during OAuth callback to validate PKCE
 *
 * @param {string} codeVerifier - Code verifier from client
 * @param {string} codeChallenge - Stored code challenge
 * @returns {boolean} True if valid
 */
function verifyCodeChallenge(codeVerifier, codeChallenge) {
  const computedChallenge = generateCodeChallenge(codeVerifier);
  return crypto.timingSafeEqual(
    Buffer.from(computedChallenge),
    Buffer.from(codeChallenge)
  );
}

/**
 * Generate PKCE pair (verifier + challenge)
 * Convenience method for generating both at once
 *
 * @returns {object} { codeVerifier, codeChallenge, codeChallengeMethod }
 */
function generatePKCEPair() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256' // Always use SHA-256
  };
}

const traced = wrapModuleFunctions('utils.pkce', {
  generateCodeVerifier,
  generateCodeChallenge,
  verifyCodeChallenge,
  generatePKCEPair,
  base64URLEncode
});

const {
  generateCodeVerifier: tracedGenerateCodeVerifier,
  generateCodeChallenge: tracedGenerateCodeChallenge,
  verifyCodeChallenge: tracedVerifyCodeChallenge,
  generatePKCEPair: tracedGeneratePKCEPair,
  base64URLEncode: tracedBase64URLEncode
} = traced;

export {
  tracedGenerateCodeVerifier as generateCodeVerifier,
  tracedGenerateCodeChallenge as generateCodeChallenge,
  tracedVerifyCodeChallenge as verifyCodeChallenge,
  tracedGeneratePKCEPair as generatePKCEPair,
  tracedBase64URLEncode as base64URLEncode
};
