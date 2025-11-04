/**
 * Shared utilities for token expiry calculation
 *
 * Unifies the expiry date calculation logic to prevent
 * fragile heuristics and inconsistencies.
 */

import { wrapModuleFunctions } from './advancedDebugging.js';

/**
 * Determines expiry date from Google OAuth token response
 *
 * Google returns either:
 * - expiry_date: Unix timestamp in milliseconds
 * - expires_in: Seconds until expiration
 *
 * @param {object} tokens - Token object from Google OAuth
 * @param {number} [tokens.expiry_date] - Expiry timestamp (ms)
 * @param {number} [tokens.expires_in] - Seconds until expiry
 * @returns {Date} Expiry date
 */
function determineExpiryDate(tokens) {
  // Priority 1: Use explicit expiry_date if available
  if (tokens.expiry_date) {
    return new Date(tokens.expiry_date);
  }

  // Priority 2: Calculate from expires_in
  if (tokens.expires_in) {
    return new Date(Date.now() + tokens.expires_in * 1000);
  }

  // Fallback: Default to 1 hour (Google's typical access token TTL)
  console.warn('⚠️  No expiry information in token response, using 1 hour default');
  return new Date(Date.now() + 3600 * 1000);
}

/**
 * Validate expiry date is reasonable
 * Detects potential errors in expiry calculation
 *
 * @param {Date} expiryDate - Expiry date to validate
 * @returns {boolean} True if valid
 */
function validateExpiryDate(expiryDate) {
  if (!(expiryDate instanceof Date) || isNaN(expiryDate.getTime())) {
    console.error('❌ Invalid expiry date:', expiryDate);
    return false;
  }

  const now = Date.now();
  const expiryTime = expiryDate.getTime();
  const timeUntilExpiry = expiryTime - now;

  // Warn if expiry is in the past
  if (timeUntilExpiry < 0) {
    console.warn('⚠️  Expiry date is in the past:', expiryDate.toISOString());
    return false;
  }

  // Warn if expiry is more than 7 days in future (unusual for Google tokens)
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  if (timeUntilExpiry > SEVEN_DAYS_MS) {
    console.warn('⚠️  Expiry date is unusually far in future:', expiryDate.toISOString());
  }

  return true;
}

/**
 * Check if token is expired or expiring soon
 *
 * @param {Date} expiryDate - Token expiry date
 * @param {number} [bufferMs=300000] - Buffer time in ms (default 5 min)
 * @returns {boolean} True if expired or expiring soon
 */
function isTokenExpired(expiryDate, bufferMs = 5 * 60 * 1000) {
  const now = Date.now();
  const expiry = new Date(expiryDate).getTime();

  return now >= (expiry - bufferMs);
}

const traced = wrapModuleFunctions('utils.tokenExpiry', {
  determineExpiryDate,
  validateExpiryDate,
  isTokenExpired
});

const {
  determineExpiryDate: tracedDetermineExpiryDate,
  validateExpiryDate: tracedValidateExpiryDate,
  isTokenExpired: tracedIsTokenExpired
} = traced;

export {
  tracedDetermineExpiryDate as determineExpiryDate,
  tracedValidateExpiryDate as validateExpiryDate,
  tracedIsTokenExpired as isTokenExpired
};
