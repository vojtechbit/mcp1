#!/usr/bin/env node

/**
 * Script to apply code improvements to large files
 * (Workaround for Edit tool limitations on large files)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🔧 Applying code improvements...\n');

// ==================== googleApiService.js improvements ====================

const googleApiServicePath = path.join(projectRoot, 'src/services/googleApiService.js');
let googleApiCode = fs.readFileSync(googleApiServicePath, 'utf8');

console.log('📝 Updating src/services/googleApiService.js...');

// 1. Replace handleGoogleApiCall with improved version (exponential backoff)
const oldHandleGoogleApiCall = `/**
 * Wrapper to handle Google API errors with automatic token refresh on 401
 */
async function handleGoogleApiCall(googleSub, apiCall, retryCount = 0) {
  const MAX_RETRIES = 2;
  const callTimer = startTimer();

  try {
    const result = await apiCall();
    logDuration('google.apiCall', callTimer, {
      googleSub,
      retry: retryCount
    });
    return result;
  } catch (error) {
    logDuration('google.apiCall', callTimer, {
      googleSub,
      retry: retryCount,
      status: 'error',
      error: error?.code || error?.response?.status || error?.message?.slice(0, 120) || 'unknown'
    });
    const is401 = error.code === 401 ||
                  error.response?.status === 401 ||
                  error.message?.includes('Login Required') ||
                  error.message?.includes('Invalid Credentials') ||
                  error.message?.includes('invalid_grant');

    if (is401 && retryCount < MAX_RETRIES) {
      console.log(\`⚠️ 401 error detected (attempt \${retryCount + 1}/\${MAX_RETRIES + 1}), forcing token refresh...\`);

      try {
        await getValidAccessToken(googleSub, true);
        await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
        return await handleGoogleApiCall(googleSub, apiCall, retryCount + 1);`;

const newHandleGoogleApiCall = `/**
 * Wrapper to handle Google API errors with automatic token refresh on 401
 * and exponential backoff for 429/5xx errors
 */
async function handleGoogleApiCall(googleSub, apiCall, retryCount = 0) {
  const MAX_AUTH_RETRIES = 2;
  const callTimer = startTimer();

  try {
    // Wrap apiCall with exponential backoff for retryable errors (429, 5xx)
    const result = await retryWithExponentialBackoff(
      apiCall,
      {
        delays: [1000, 2000, 4000], // 1s, 2s, 4s
        shouldRetry: (error) => {
          // Don't retry auth errors with exponential backoff (handle separately)
          const is401 = error.code === 401 ||
                        error.response?.status === 401 ||
                        error.message?.includes('Login Required') ||
                        error.message?.includes('Invalid Credentials');

          if (is401) return false;

          // Retry rate limits and server errors
          return isRetryableError(error);
        },
        operationName: 'Google API call'
      }
    );

    logDuration('google.apiCall', callTimer, {
      googleSub,
      retry: retryCount
    });
    return result;
  } catch (error) {
    logDuration('google.apiCall', callTimer, {
      googleSub,
      retry: retryCount,
      status: 'error',
      error: error?.code || error?.response?.status || error?.message?.slice(0, 120) || 'unknown'
    });

    const is401 = error.code === 401 ||
                  error.response?.status === 401 ||
                  error.message?.includes('Login Required') ||
                  error.message?.includes('Invalid Credentials') ||
                  error.message?.includes('invalid_grant');

    if (is401 && retryCount < MAX_AUTH_RETRIES) {
      console.log(\`⚠️  401 error detected (attempt \${retryCount + 1}/\${MAX_AUTH_RETRIES + 1}), forcing token refresh...\`);

      try {
        await getValidAccessToken(googleSub, true);
        await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
        return await handleGoogleApiCall(googleSub, apiCall, retryCount + 1);`;

if (googleApiCode.includes(oldHandleGoogleApiCall)) {
  googleApiCode = googleApiCode.replace(oldHandleGoogleApiCall, newHandleGoogleApiCall);
  console.log('  ✅ Updated handleGoogleApiCall with exponential backoff');
} else {
  console.log('  ⏭️  handleGoogleApiCall already updated or pattern not found');
}

// 2. Replace token expiry calculation
const oldExpiryCalc = `          let expiryDate;
          const expiryValue = newTokens.expiry_date || 3600;
          if (expiryValue > 86400) {
            expiryDate = new Date(expiryValue * 1000);
          } else {
            expiryDate = new Date(Date.now() + (expiryValue * 1000));
          }`;

const newExpiryCalc = `          const expiryDate = determineExpiryDate(newTokens);`;

if (googleApiCode.includes(oldExpiryCalc)) {
  googleApiCode = googleApiCode.replace(oldExpiryCalc, newExpiryCalc);
  console.log('  ✅ Updated token expiry calculation');
} else {
  console.log('  ⏭️  Token expiry calculation already updated');
}

// 3. Replace isExpired check
const oldIsExpiredCheck = `    const now = new Date();
    const expiry = new Date(user.tokenExpiry);
    const bufferTime = 5 * 60 * 1000;
    const isExpired = now >= (expiry.getTime() - bufferTime);`;

const newIsExpiredCheck = `    const isExpired = isTokenExpired(user.tokenExpiry);`;

if (googleApiCode.includes(oldIsExpiredCheck)) {
  googleApiCode = googleApiCode.replace(oldIsExpiredCheck, newIsExpiredCheck);
  console.log('  ✅ Updated isExpired check');
} else {
  console.log('  ⏭️  isExpired check already updated');
}

fs.writeFileSync(googleApiServicePath, googleApiCode, 'utf8');
console.log('✅ googleApiService.js updated\n');

// ==================== backgroundRefreshService.js improvements ====================

const backgroundRefreshPath = path.join(projectRoot, 'src/services/backgroundRefreshService.js');
let backgroundRefreshCode = fs.readFileSync(backgroundRefreshPath, 'utf8');

console.log('📝 Updating src/services/backgroundRefreshService.js...');

// Check if already importing shared utility
if (!backgroundRefreshCode.includes('from \'../utils/tokenExpiry.js\'')) {
  // Add import after first import statement
  backgroundRefreshCode = backgroundRefreshCode.replace(
    /^(import .* from '\.\/databaseService\.js';)$/m,
    `$1\nimport { determineExpiryDate } from '../utils/tokenExpiry.js';`
  );

  // Replace local determineExpiryDate function
  const oldDetermineExpiryDate = `function determineExpiryDate(newTokens) {
  if (newTokens.expiry_date) {
    return new Date(newTokens.expiry_date);
  }

  if (newTokens.expires_in) {
    return new Date(Date.now() + newTokens.expires_in * 1000);
  }

  return new Date(Date.now() + 3600 * 1000);
}`;

  if (backgroundRefreshCode.includes(oldDetermineExpiryDate)) {
    backgroundRefreshCode = backgroundRefreshCode.replace(oldDetermineExpiryDate, '// determineExpiryDate now imported from shared utility');
    console.log('  ✅ Replaced local determineExpiryDate with shared utility');
  } else {
    console.log('  ⏭️  determineExpiryDate already using shared utility');
  }

  fs.writeFileSync(backgroundRefreshPath, backgroundRefreshCode, 'utf8');
  console.log('✅ backgroundRefreshService.js updated\n');
} else {
  console.log('  ⏭️  Already using shared utility\n');
}

console.log('✅ All improvements applied successfully!');
