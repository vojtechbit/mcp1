/**
 * Exponential Backoff Utility
 *
 * Provides retry logic with exponential backoff for transient failures
 * (rate limits, server errors, network issues)
 */

import { wrapModuleFunctions } from './advancedDebugging.js';

/**
 * Default retry delays in milliseconds (exponential backoff)
 * 1s, 2s, 4s, 8s
 */
const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000, 8000];

/**
 * Sleep for specified milliseconds
 */
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 *
 * @param {Function} fn - Async function to retry
 * @param {object} options - Retry options
 * @param {number[]} [options.delays] - Custom delay array (ms)
 * @param {Function} [options.shouldRetry] - Predicate to determine if error is retryable
 * @param {string} [options.operationName] - Name for logging
 * @returns {Promise<any>} Result of successful call
 * @throws {Error} Last error if all retries exhausted
 */
async function retryWithExponentialBackoff(fn, options = {}) {
  const {
    delays = DEFAULT_RETRY_DELAYS,
    shouldRetry = isRetryableError,
    operationName = 'operation'
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const result = await fn();

      if (attempt > 0) {
        console.log(`✅ ${operationName} succeeded after ${attempt} retries`);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!shouldRetry(error)) {
        throw error;
      }

      // No more retries left
      if (attempt >= delays.length) {
        console.error(`❌ ${operationName} failed after ${attempt} retries`);
        throw error;
      }

      const delay = delays[attempt];
      console.warn(`⚠️  ${operationName} failed (attempt ${attempt + 1}/${delays.length + 1}), retrying in ${delay}ms...`, {
        error: error.message,
        status: error.response?.status || error.code
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Determine if error is retryable (429, 5xx, network errors)
 *
 * @param {Error} error - Error to check
 * @returns {boolean} True if retryable
 */
function isRetryableError(error) {
  const status = error.response?.status || error.code;

  // Rate limit errors (429)
  if (status === 429) return true;

  // Server errors (5xx)
  if (status >= 500 && status < 600) return true;

  // Network errors
  if (error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND') {
    return true;
  }

  // Google API specific transient errors
  if (error.message?.includes('quota exceeded')) return true;
  if (error.message?.includes('rate limit')) return true;
  if (error.message?.includes('internal error')) return true;
  if (error.message?.includes('temporarily unavailable')) return true;

  return false;
}

/**
 * Get retry-after delay from error response
 *
 * @param {Error} error - Error with potential Retry-After header
 * @returns {number|null} Delay in ms, or null
 */
function getRetryAfterMs(error) {
  const retryAfter = error.response?.headers?.['retry-after'];

  if (!retryAfter) return null;

  // Retry-After can be seconds or HTTP date
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return null;
}

const traced = wrapModuleFunctions('utils.exponentialBackoff', {
  retryWithExponentialBackoff,
  isRetryableError,
  getRetryAfterMs,
  sleep
});

const {
  retryWithExponentialBackoff: tracedRetryWithExponentialBackoff,
  isRetryableError: tracedIsRetryableError,
  getRetryAfterMs: tracedGetRetryAfterMs,
  sleep: tracedSleep
} = traced;

export {
  tracedRetryWithExponentialBackoff as retryWithExponentialBackoff,
  tracedIsRetryableError as isRetryableError,
  tracedGetRetryAfterMs as getRetryAfterMs,
  tracedSleep as sleep,
  DEFAULT_RETRY_DELAYS
};
