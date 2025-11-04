/**
 * OAuth Security Utilities
 *
 * Validation and security helpers for OAuth flow
 */

import { wrapModuleFunctions } from './advancedDebugging.js';

/**
 * Allowed redirect URIs (whitelist)
 * Add your production domains here
 *
 * To add your ChatGPT GPT ID, set CHATGPT_GPT_ID in .env
 * Example: CHATGPT_GPT_ID=g-abc123xyz
 */
const CHATGPT_GPT_ID = process.env.CHATGPT_GPT_ID; // Optional: specific GPT ID

const ALLOWED_REDIRECT_URIS = [
  // Specific GPT redirect URI (if configured in .env)
  CHATGPT_GPT_ID ? `https://chat.openai.com/aip/${CHATGPT_GPT_ID}/oauth/callback` : null,
  CHATGPT_GPT_ID ? `https://chatgpt.com/aip/${CHATGPT_GPT_ID}/oauth/callback` : null,
  // Alternative: from .env
  process.env.CHATGPT_REDIRECT_URI,
  // Development only
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000/auth/callback' : null
].filter(Boolean); // Remove undefined

/**
 * Validate OAuth redirect URI against whitelist
 *
 * Prevents open redirect attacks
 *
 * @param {string} redirectUri - URI to validate
 * @returns {boolean} True if valid
 */
function validateRedirectUri(redirectUri) {
  if (!redirectUri) {
    return false;
  }

  // Exact match against whitelist
  if (ALLOWED_REDIRECT_URIS.includes(redirectUri)) {
    return true;
  }

  // Pattern match for ChatGPT OAuth callback
  // Format: https://chat.openai.com/aip/g-*/oauth/callback
  const chatGPTPattern = /^https:\/\/(chat\.openai\.com|chatgpt\.com)\/aip\/g-[a-zA-Z0-9]+\/oauth\/callback$/;
  if (chatGPTPattern.test(redirectUri)) {
    return true;
  }

  // Development localhost
  if (process.env.NODE_ENV === 'development') {
    if (redirectUri.startsWith('http://localhost:')) {
      return true;
    }
  }

  console.warn('⚠️  Rejected redirect_uri:', redirectUri);
  return false;
}

/**
 * Validate OAuth state parameter
 *
 * Prevents CSRF attacks
 *
 * @param {string} state - State from callback
 * @param {string} expectedState - Stored state
 * @returns {boolean} True if valid
 */
function validateState(state, expectedState) {
  if (!state || !expectedState) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  if (state.length !== expectedState.length) {
    return false;
  }

  try {
    const stateBuffer = Buffer.from(state);
    const expectedBuffer = Buffer.from(expectedState);

    return crypto.timingSafeEqual(stateBuffer, expectedBuffer);
  } catch (error) {
    console.error('State validation error:', error.message);
    return false;
  }
}

/**
 * Generate cryptographically secure state parameter
 *
 * @param {number} [bytes=32] - Number of random bytes
 * @returns {string} Hex-encoded state
 */
function generateState(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Validate authorization code format
 * Basic sanity check before exchange
 *
 * @param {string} code - Authorization code
 * @returns {boolean} True if format is valid
 */
function validateAuthCode(code) {
  if (!code || typeof code !== 'string') {
    return false;
  }

  // Google auth codes are typically 32-256 characters
  if (code.length < 10 || code.length > 512) {
    console.warn('⚠️  Auth code length suspicious:', code.length);
    return false;
  }

  // Should be alphanumeric + URL-safe chars
  if (!/^[a-zA-Z0-9_\-\.~]+$/.test(code)) {
    console.warn('⚠️  Auth code contains invalid characters');
    return false;
  }

  return true;
}

import crypto from 'crypto';

const traced = wrapModuleFunctions('utils.oauthSecurity', {
  validateRedirectUri,
  validateState,
  generateState,
  validateAuthCode
});

const {
  validateRedirectUri: tracedValidateRedirectUri,
  validateState: tracedValidateState,
  generateState: tracedGenerateState,
  validateAuthCode: tracedValidateAuthCode
} = traced;

export {
  tracedValidateRedirectUri as validateRedirectUri,
  tracedValidateState as validateState,
  tracedGenerateState as generateState,
  tracedValidateAuthCode as validateAuthCode,
  ALLOWED_REDIRECT_URIS
};
