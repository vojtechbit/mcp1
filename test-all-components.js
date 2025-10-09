console.log('🔬 COMPREHENSIVE TESTING - All Components\n');
console.log('='.repeat(60));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Helper functions
function testPassed(name) {
  console.log(`✅ ${name}`);
  passedTests++;
  totalTests++;
}

function testFailed(name, error) {
  console.log(`❌ ${name}`);
  console.log(`   Error: ${error.message}`);
  failedTests++;
  totalTests++;
}

// ==================== TEST 1: Config Files ====================
console.log('\n📦 TEST 1: Config Files');
console.log('-'.repeat(60));

try {
  const { connectToDatabase, getDatabase } = await import('./src/config/database.js');
  if (typeof connectToDatabase === 'function' && typeof getDatabase === 'function') {
    testPassed('database.js - exports correct functions');
  } else {
    testFailed('database.js', new Error('Missing expected functions'));
  }
} catch (error) {
  testFailed('database.js', error);
}

try {
  const oauth = await import('./src/config/oauth.js');
  if (oauth.oauth2Client && typeof oauth.getAuthUrl === 'function' && 
      typeof oauth.getTokensFromCode === 'function' && typeof oauth.refreshAccessToken === 'function') {
    testPassed('oauth.js - exports correct functions and client');
  } else {
    testFailed('oauth.js', new Error('Missing expected exports'));
  }
} catch (error) {
  testFailed('oauth.js', error);
}

// ==================== TEST 2: Services ====================
console.log('\n🔧 TEST 2: Services');
console.log('-'.repeat(60));

try {
  const { encryptToken, decryptToken, testEncryption } = await import('./src/services/tokenService.js');
  if (typeof encryptToken === 'function' && typeof decryptToken === 'function') {
    testPassed('tokenService.js - exports correct functions');
    
    // Test encryption/decryption
    try {
      const testData = 'test_token_123';
      const encrypted = encryptToken(testData);
      const decrypted = decryptToken(encrypted.encryptedToken, encrypted.iv, encrypted.authTag);
      
      if (decrypted === testData) {
        testPassed('tokenService.js - encryption/decryption works');
      } else {
        testFailed('tokenService.js - encryption/decryption', new Error('Decrypted value does not match original'));
      }
    } catch (err) {
      testFailed('tokenService.js - encryption/decryption', err);
    }
  } else {
    testFailed('tokenService.js', new Error('Missing expected functions'));
  }
} catch (error) {
  testFailed('tokenService.js', error);
}

try {
  const db = await import('./src/services/databaseService.js');
  const requiredFunctions = ['saveUser', 'getUserByGoogleSub', 'updateTokens', 'deleteUser', 'updateLastUsed'];
  const allPresent = requiredFunctions.every(fn => typeof db[fn] === 'function');
  
  if (allPresent) {
    testPassed('databaseService.js - exports all 5 functions');
  } else {
    testFailed('databaseService.js', new Error('Missing some functions'));
  }
} catch (error) {
  testFailed('databaseService.js', error);
}

try {
  const googleApi = await import('./src/services/googleApiService.js');
  const requiredFunctions = [
    'getValidAccessToken',
    'sendEmail', 'readEmail', 'searchEmails', 'replyToEmail', 'createDraft', 
    'deleteEmail', 'toggleStar', 'markAsRead',
    'createCalendarEvent', 'getCalendarEvent', 'listCalendarEvents', 
    'updateCalendarEvent', 'deleteCalendarEvent'
  ];
  
  const allPresent = requiredFunctions.every(fn => typeof googleApi[fn] === 'function');
  
  if (allPresent) {
    testPassed('googleApiService.js - exports all 14 functions');
  } else {
    const missing = requiredFunctions.filter(fn => typeof googleApi[fn] !== 'function');
    testFailed('googleApiService.js', new Error(`Missing functions: ${missing.join(', ')}`));
  }
} catch (error) {
  testFailed('googleApiService.js', error);
}

// ==================== TEST 3: Middleware ====================
console.log('\n🛡️  TEST 3: Middleware');
console.log('-'.repeat(60));

try {
  const { verifyToken, requireDatabaseUser } = await import('./src/middleware/authMiddleware.js');
  if (typeof verifyToken === 'function' && typeof requireDatabaseUser === 'function') {
    testPassed('authMiddleware.js - exports correct functions');
  } else {
    testFailed('authMiddleware.js', new Error('Missing expected functions'));
  }
} catch (error) {
  testFailed('authMiddleware.js', error);
}

try {
  const { errorHandler, notFoundHandler, asyncHandler } = await import('./src/middleware/errorHandler.js');
  if (typeof errorHandler === 'function' && typeof notFoundHandler === 'function' && typeof asyncHandler === 'function') {
    testPassed('errorHandler.js - exports correct functions');
  } else {
    testFailed('errorHandler.js', new Error('Missing expected functions'));
  }
} catch (error) {
  testFailed('errorHandler.js', error);
}

// ==================== TEST 4: Controllers ====================
console.log('\n🎮 TEST 4: Controllers');
console.log('-'.repeat(60));

try {
  const { initiateOAuth, handleCallback, checkStatus } = await import('./src/controllers/authController.js');
  if (typeof initiateOAuth === 'function' && typeof handleCallback === 'function' && typeof checkStatus === 'function') {
    testPassed('authController.js - exports all 3 functions');
  } else {
    testFailed('authController.js', new Error('Missing expected functions'));
  }
} catch (error) {
  testFailed('authController.js', error);
}

try {
  const gmail = await import('./src/controllers/gmailController.js');
  const requiredFunctions = ['sendEmail', 'readEmail', 'searchEmails', 'replyToEmail', 'createDraft', 'deleteEmail', 'toggleStar', 'markAsRead'];
  const allPresent = requiredFunctions.every(fn => typeof gmail[fn] === 'function');
  
  if (allPresent) {
    testPassed('gmailController.js - exports all 8 functions');
  } else {
    const missing = requiredFunctions.filter(fn => typeof gmail[fn] !== 'function');
    testFailed('gmailController.js', new Error(`Missing functions: ${missing.join(', ')}`));
  }
} catch (error) {
  testFailed('gmailController.js', error);
}

try {
  const calendar = await import('./src/controllers/calendarController.js');
  const requiredFunctions = ['createEvent', 'getEvent', 'listEvents', 'updateEvent', 'deleteEvent'];
  const allPresent = requiredFunctions.every(fn => typeof calendar[fn] === 'function');
  
  if (allPresent) {
    testPassed('calendarController.js - exports all 5 functions');
  } else {
    const missing = requiredFunctions.filter(fn => typeof calendar[fn] !== 'function');
    testFailed('calendarController.js', new Error(`Missing functions: ${missing.join(', ')}`));
  }
} catch (error) {
  testFailed('calendarController.js', error);
}

// ==================== TEST 5: Environment Variables ====================
console.log('\n🔐 TEST 5: Environment Variables');
console.log('-'.repeat(60));

import dotenv from 'dotenv';
dotenv.config();

const requiredEnvVars = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'REDIRECT_URI',
  'ENCRYPTION_KEY',
  'MONGODB_URI',
  'PORT',
  'NODE_ENV'
];

let envVarsPresent = 0;
requiredEnvVars.forEach(varName => {
  if (process.env[varName]) {
    testPassed(`.env - ${varName} is set`);
    envVarsPresent++;
  } else {
    testFailed(`.env - ${varName}`, new Error('Not set in .env'));
  }
});

// Check ENCRYPTION_KEY format
if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length === 64) {
  testPassed('.env - ENCRYPTION_KEY has correct length (64 chars)');
} else if (process.env.ENCRYPTION_KEY) {
  testFailed('.env - ENCRYPTION_KEY length', new Error(`Expected 64 chars, got ${process.env.ENCRYPTION_KEY.length}`));
}

// ==================== SUMMARY ====================
console.log('\n' + '='.repeat(60));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total tests: ${totalTests}`);
console.log(`✅ Passed: ${passedTests}`);
console.log(`❌ Failed: ${failedTests}`);
console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

if (failedTests === 0) {
  console.log('\n🎉 ALL TESTS PASSED! 🎉');
  console.log('✅ Your codebase structure is solid!');
  console.log('✅ All imports and exports work correctly!');
  console.log('✅ Ready to continue with routes and server!');
  process.exit(0);
} else {
  console.log('\n⚠️  SOME TESTS FAILED');
  console.log('Please fix the errors above before continuing.');
  process.exit(1);
}
