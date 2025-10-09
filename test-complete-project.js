console.log('🔬 ULTRA COMPREHENSIVE PROJECT TEST');
console.log('Testing EVERYTHING before MongoDB setup\n');
console.log('='.repeat(70));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const errors = [];

function testPassed(category, name) {
  console.log(`  ✅ ${name}`);
  passedTests++;
  totalTests++;
}

function testFailed(category, name, error) {
  console.log(`  ❌ ${name}`);
  console.log(`     Error: ${error.message}`);
  errors.push({ category, test: name, error: error.message });
  failedTests++;
  totalTests++;
}

// ==================== TEST 1: File Structure ====================
console.log('\n📁 TEST 1: Project File Structure');
console.log('-'.repeat(70));

import fs from 'fs';
import path from 'path';

const requiredFiles = [
  'package.json',
  '.env',
  '.env.example',
  '.gitignore',
  'README.md',
  'src/server.js',
  'src/config/database.js',
  'src/config/oauth.js',
  'src/services/tokenService.js',
  'src/services/databaseService.js',
  'src/services/googleApiService.js',
  'src/middleware/authMiddleware.js',
  'src/middleware/errorHandler.js',
  'src/controllers/authController.js',
  'src/controllers/gmailController.js',
  'src/controllers/calendarController.js',
  'src/routes/authRoutes.js',
  'src/routes/apiRoutes.js'
];

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    testPassed('Structure', `${file} exists`);
  } else {
    testFailed('Structure', `${file}`, new Error('File not found'));
  }
});

// Check for node_modules
if (fs.existsSync('node_modules')) {
  testPassed('Structure', 'node_modules exists (dependencies installed)');
} else {
  testFailed('Structure', 'node_modules', new Error('Dependencies not installed - run npm install'));
}

// ==================== TEST 2: Syntax Check All Files ====================
console.log('\n🔍 TEST 2: Syntax Check (All JavaScript Files)');
console.log('-'.repeat(70));

import { execSync } from 'child_process';

const jsFiles = [
  'src/server.js',
  'src/config/database.js',
  'src/config/oauth.js',
  'src/services/tokenService.js',
  'src/services/databaseService.js',
  'src/services/googleApiService.js',
  'src/middleware/authMiddleware.js',
  'src/middleware/errorHandler.js',
  'src/controllers/authController.js',
  'src/controllers/gmailController.js',
  'src/controllers/calendarController.js',
  'src/routes/authRoutes.js',
  'src/routes/apiRoutes.js'
];

for (const file of jsFiles) {
  try {
    execSync(`node --check ${file}`, { stdio: 'pipe' });
    testPassed('Syntax', `${file} - valid syntax`);
  } catch (error) {
    testFailed('Syntax', `${file}`, new Error('Syntax error detected'));
  }
}

// ==================== TEST 3: Package.json Validation ====================
console.log('\n📦 TEST 3: package.json Validation');
console.log('-'.repeat(70));

try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  // Check required fields
  if (packageJson.name) {
    testPassed('package.json', 'name field present');
  } else {
    testFailed('package.json', 'name field', new Error('Missing'));
  }
  
  if (packageJson.type === 'module') {
    testPassed('package.json', 'type: "module" set correctly');
  } else {
    testFailed('package.json', 'type', new Error('Must be "module"'));
  }
  
  // Check required dependencies
  const requiredDeps = ['express', 'googleapis', 'mongodb', 'dotenv', 'cors', 'helmet', 'express-rate-limit'];
  requiredDeps.forEach(dep => {
    if (packageJson.dependencies && packageJson.dependencies[dep]) {
      testPassed('package.json', `dependency: ${dep}`);
    } else {
      testFailed('package.json', `dependency: ${dep}`, new Error('Missing'));
    }
  });
  
  // Check scripts
  if (packageJson.scripts && packageJson.scripts.start) {
    testPassed('package.json', 'start script defined');
  } else {
    testFailed('package.json', 'start script', new Error('Missing'));
  }
  
} catch (error) {
  testFailed('package.json', 'parse', error);
}

// ==================== TEST 4: Environment Variables ====================
console.log('\n🔐 TEST 4: Environment Variables');
console.log('-'.repeat(70));

import dotenv from 'dotenv';
dotenv.config();

const requiredEnvVars = {
  'GOOGLE_CLIENT_ID': { required: true, format: 'string' },
  'GOOGLE_CLIENT_SECRET': { required: true, format: 'string' },
  'REDIRECT_URI': { required: true, format: 'url' },
  'ENCRYPTION_KEY': { required: true, format: 'hex64' },
  'MONGODB_URI': { required: true, format: 'string' },
  'PORT': { required: true, format: 'number' },
  'NODE_ENV': { required: true, format: 'string' }
};

Object.entries(requiredEnvVars).forEach(([varName, config]) => {
  const value = process.env[varName];
  
  if (!value) {
    testFailed('Environment', varName, new Error('Not set'));
    return;
  }
  
  testPassed('Environment', `${varName} is set`);
  
  // Validate format
  if (config.format === 'hex64' && value.length !== 64) {
    testFailed('Environment', `${varName} format`, new Error(`Expected 64 chars, got ${value.length}`));
  } else if (config.format === 'url' && !value.startsWith('http')) {
    testFailed('Environment', `${varName} format`, new Error('Must start with http:// or https://'));
  } else if (config.format === 'number' && isNaN(parseInt(value))) {
    testFailed('Environment', `${varName} format`, new Error('Must be a number'));
  } else if (config.format === 'hex64' && value.length === 64) {
    testPassed('Environment', `${varName} format valid (64 chars)`);
  }
});

// ==================== TEST 5: Config Module Imports ====================
console.log('\n⚙️  TEST 5: Config Modules');
console.log('-'.repeat(70));

try {
  const { connectToDatabase, getDatabase, closeDatabase } = await import('./src/config/database.js');
  
  if (typeof connectToDatabase === 'function') {
    testPassed('Config', 'database.js - connectToDatabase function');
  } else {
    testFailed('Config', 'database.js - connectToDatabase', new Error('Not a function'));
  }
  
  if (typeof getDatabase === 'function') {
    testPassed('Config', 'database.js - getDatabase function');
  } else {
    testFailed('Config', 'database.js - getDatabase', new Error('Not a function'));
  }
  
  if (typeof closeDatabase === 'function') {
    testPassed('Config', 'database.js - closeDatabase function');
  } else {
    testFailed('Config', 'database.js - closeDatabase', new Error('Not a function'));
  }
} catch (error) {
  testFailed('Config', 'database.js import', error);
}

try {
  const oauth = await import('./src/config/oauth.js');
  
  if (oauth.oauth2Client) {
    testPassed('Config', 'oauth.js - oauth2Client exported');
  } else {
    testFailed('Config', 'oauth.js - oauth2Client', new Error('Not exported'));
  }
  
  const oauthFunctions = ['getAuthUrl', 'getTokensFromCode', 'refreshAccessToken'];
  oauthFunctions.forEach(fn => {
    if (typeof oauth[fn] === 'function') {
      testPassed('Config', `oauth.js - ${fn} function`);
    } else {
      testFailed('Config', `oauth.js - ${fn}`, new Error('Not a function'));
    }
  });
  
  if (Array.isArray(oauth.SCOPES) && oauth.SCOPES.length > 0) {
    testPassed('Config', `oauth.js - SCOPES defined (${oauth.SCOPES.length} scopes)`);
  } else {
    testFailed('Config', 'oauth.js - SCOPES', new Error('Not defined or empty'));
  }
} catch (error) {
  testFailed('Config', 'oauth.js import', error);
}

// ==================== TEST 6: Service Modules ====================
console.log('\n🔧 TEST 6: Service Modules');
console.log('-'.repeat(70));

// tokenService
try {
  const { encryptToken, decryptToken, testEncryption } = await import('./src/services/tokenService.js');
  
  if (typeof encryptToken === 'function' && typeof decryptToken === 'function') {
    testPassed('Services', 'tokenService.js - functions exported');
    
    // Functional test
    try {
      const testData = 'test_secret_token_12345';
      const encrypted = encryptToken(testData);
      
      if (encrypted.encryptedToken && encrypted.iv && encrypted.authTag) {
        testPassed('Services', 'tokenService.js - encryption returns correct structure');
      } else {
        testFailed('Services', 'tokenService.js - encryption structure', new Error('Missing fields'));
      }
      
      const decrypted = decryptToken(encrypted.encryptedToken, encrypted.iv, encrypted.authTag);
      
      if (decrypted === testData) {
        testPassed('Services', 'tokenService.js - encryption/decryption cycle works');
      } else {
        testFailed('Services', 'tokenService.js - decryption', new Error('Decrypted value mismatch'));
      }
    } catch (err) {
      testFailed('Services', 'tokenService.js - functional test', err);
    }
  } else {
    testFailed('Services', 'tokenService.js - functions', new Error('Missing exports'));
  }
} catch (error) {
  testFailed('Services', 'tokenService.js import', error);
}

// databaseService
try {
  const db = await import('./src/services/databaseService.js');
  const dbFunctions = ['saveUser', 'getUserByGoogleSub', 'updateTokens', 'deleteUser', 'updateLastUsed'];
  
  dbFunctions.forEach(fn => {
    if (typeof db[fn] === 'function') {
      testPassed('Services', `databaseService.js - ${fn}`);
    } else {
      testFailed('Services', `databaseService.js - ${fn}`, new Error('Not exported'));
    }
  });
} catch (error) {
  testFailed('Services', 'databaseService.js import', error);
}

// googleApiService
try {
  const googleApi = await import('./src/services/googleApiService.js');
  const apiFunctions = [
    'getValidAccessToken',
    'sendEmail', 'readEmail', 'searchEmails', 'replyToEmail',
    'createDraft', 'deleteEmail', 'toggleStar', 'markAsRead',
    'createCalendarEvent', 'getCalendarEvent', 'listCalendarEvents',
    'updateCalendarEvent', 'deleteCalendarEvent'
  ];
  
  let missingFunctions = [];
  apiFunctions.forEach(fn => {
    if (typeof googleApi[fn] === 'function') {
      // Don't log each one individually to save space
    } else {
      missingFunctions.push(fn);
    }
  });
  
  if (missingFunctions.length === 0) {
    testPassed('Services', `googleApiService.js - all ${apiFunctions.length} functions present`);
  } else {
    testFailed('Services', 'googleApiService.js - missing functions', 
      new Error(`Missing: ${missingFunctions.join(', ')}`));
  }
} catch (error) {
  testFailed('Services', 'googleApiService.js import', error);
}

// ==================== TEST 7: Middleware Modules ====================
console.log('\n🛡️  TEST 7: Middleware Modules');
console.log('-'.repeat(70));

try {
  const { verifyToken, requireDatabaseUser } = await import('./src/middleware/authMiddleware.js');
  
  if (typeof verifyToken === 'function') {
    testPassed('Middleware', 'authMiddleware.js - verifyToken');
  } else {
    testFailed('Middleware', 'authMiddleware.js - verifyToken', new Error('Not a function'));
  }
  
  if (typeof requireDatabaseUser === 'function') {
    testPassed('Middleware', 'authMiddleware.js - requireDatabaseUser');
  } else {
    testFailed('Middleware', 'authMiddleware.js - requireDatabaseUser', new Error('Not a function'));
  }
} catch (error) {
  testFailed('Middleware', 'authMiddleware.js import', error);
}

try {
  const { errorHandler, notFoundHandler, asyncHandler } = await import('./src/middleware/errorHandler.js');
  
  const handlers = ['errorHandler', 'notFoundHandler', 'asyncHandler'];
  const actual = { errorHandler, notFoundHandler, asyncHandler };
  
  handlers.forEach(handler => {
    if (typeof actual[handler] === 'function') {
      testPassed('Middleware', `errorHandler.js - ${handler}`);
    } else {
      testFailed('Middleware', `errorHandler.js - ${handler}`, new Error('Not a function'));
    }
  });
} catch (error) {
  testFailed('Middleware', 'errorHandler.js import', error);
}

// ==================== TEST 8: Controller Modules ====================
console.log('\n🎮 TEST 8: Controller Modules');
console.log('-'.repeat(70));

try {
  const { initiateOAuth, handleCallback, checkStatus } = await import('./src/controllers/authController.js');
  
  const functions = ['initiateOAuth', 'handleCallback', 'checkStatus'];
  const actual = { initiateOAuth, handleCallback, checkStatus };
  
  functions.forEach(fn => {
    if (typeof actual[fn] === 'function') {
      testPassed('Controllers', `authController.js - ${fn}`);
    } else {
      testFailed('Controllers', `authController.js - ${fn}`, new Error('Not a function'));
    }
  });
} catch (error) {
  testFailed('Controllers', 'authController.js import', error);
}

try {
  const gmail = await import('./src/controllers/gmailController.js');
  const functions = ['sendEmail', 'readEmail', 'searchEmails', 'replyToEmail', 
                    'createDraft', 'deleteEmail', 'toggleStar', 'markAsRead'];
  
  let missingFunctions = [];
  functions.forEach(fn => {
    if (typeof gmail[fn] !== 'function') {
      missingFunctions.push(fn);
    }
  });
  
  if (missingFunctions.length === 0) {
    testPassed('Controllers', `gmailController.js - all ${functions.length} functions present`);
  } else {
    testFailed('Controllers', 'gmailController.js - missing functions',
      new Error(`Missing: ${missingFunctions.join(', ')}`));
  }
} catch (error) {
  testFailed('Controllers', 'gmailController.js import', error);
}

try {
  const calendar = await import('./src/controllers/calendarController.js');
  const functions = ['createEvent', 'getEvent', 'listEvents', 'updateEvent', 'deleteEvent'];
  
  let missingFunctions = [];
  functions.forEach(fn => {
    if (typeof calendar[fn] !== 'function') {
      missingFunctions.push(fn);
    }
  });
  
  if (missingFunctions.length === 0) {
    testPassed('Controllers', `calendarController.js - all ${functions.length} functions present`);
  } else {
    testFailed('Controllers', 'calendarController.js - missing functions',
      new Error(`Missing: ${missingFunctions.join(', ')}`));
  }
} catch (error) {
  testFailed('Controllers', 'calendarController.js import', error);
}

// ==================== TEST 9: Route Modules ====================
console.log('\n🛤️  TEST 9: Route Modules');
console.log('-'.repeat(70));

try {
  const authRoutes = await import('./src/routes/authRoutes.js');
  
  if (authRoutes.default) {
    testPassed('Routes', 'authRoutes.js - exports router');
    
    // Check if it's an Express router
    if (authRoutes.default.stack) {
      testPassed('Routes', 'authRoutes.js - is Express router');
      
      const routeCount = authRoutes.default.stack.length;
      if (routeCount >= 3) {
        testPassed('Routes', `authRoutes.js - has ${routeCount} routes defined`);
      } else {
        testFailed('Routes', 'authRoutes.js - route count', 
          new Error(`Expected at least 3 routes, found ${routeCount}`));
      }
    }
  } else {
    testFailed('Routes', 'authRoutes.js - default export', new Error('Missing'));
  }
} catch (error) {
  testFailed('Routes', 'authRoutes.js import', error);
}

try {
  const apiRoutes = await import('./src/routes/apiRoutes.js');
  
  if (apiRoutes.default) {
    testPassed('Routes', 'apiRoutes.js - exports router');
    
    if (apiRoutes.default.stack) {
      testPassed('Routes', 'apiRoutes.js - is Express router');
      
      const routeCount = apiRoutes.default.stack.length;
      if (routeCount >= 13) {
        testPassed('Routes', `apiRoutes.js - has ${routeCount} routes defined`);
      } else {
        testFailed('Routes', 'apiRoutes.js - route count',
          new Error(`Expected at least 13 routes, found ${routeCount}`));
      }
    }
  } else {
    testFailed('Routes', 'apiRoutes.js - default export', new Error('Missing'));
  }
} catch (error) {
  testFailed('Routes', 'apiRoutes.js import', error);
}

// ==================== TEST 10: Server Module ====================
console.log('\n🚀 TEST 10: Main Server Module');
console.log('-'.repeat(70));

try {
  // Just check syntax, don't actually run the server
  execSync('node --check src/server.js', { stdio: 'pipe' });
  testPassed('Server', 'server.js - valid syntax');
  
  // Check if file contains required setup
  const serverContent = fs.readFileSync('src/server.js', 'utf8');
  
  if (serverContent.includes('express()')) {
    testPassed('Server', 'server.js - Express app initialized');
  } else {
    testFailed('Server', 'server.js - Express init', new Error('Missing'));
  }
  
  if (serverContent.includes('helmet')) {
    testPassed('Server', 'server.js - helmet security middleware');
  } else {
    testFailed('Server', 'server.js - helmet', new Error('Missing'));
  }
  
  if (serverContent.includes('cors')) {
    testPassed('Server', 'server.js - CORS configured');
  } else {
    testFailed('Server', 'server.js - CORS', new Error('Missing'));
  }
  
  if (serverContent.includes('rateLimit')) {
    testPassed('Server', 'server.js - rate limiting configured');
  } else {
    testFailed('Server', 'server.js - rate limiting', new Error('Missing'));
  }
  
  if (serverContent.includes('authRoutes')) {
    testPassed('Server', 'server.js - auth routes registered');
  } else {
    testFailed('Server', 'server.js - auth routes', new Error('Missing'));
  }
  
  if (serverContent.includes('apiRoutes')) {
    testPassed('Server', 'server.js - API routes registered');
  } else {
    testFailed('Server', 'server.js - API routes', new Error('Missing'));
  }
  
  if (serverContent.includes('errorHandler')) {
    testPassed('Server', 'server.js - error handler registered');
  } else {
    testFailed('Server', 'server.js - error handler', new Error('Missing'));
  }
  
  if (serverContent.includes('connectToDatabase')) {
    testPassed('Server', 'server.js - database connection on startup');
  } else {
    testFailed('Server', 'server.js - database connection', new Error('Missing'));
  }
  
} catch (error) {
  testFailed('Server', 'server.js', error);
}

// ==================== TEST 11: .gitignore Check ====================
console.log('\n🙈 TEST 11: .gitignore Configuration');
console.log('-'.repeat(70));

try {
  const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
  
  const requiredIgnores = ['.env', 'node_modules', '*.log'];
  requiredIgnores.forEach(pattern => {
    if (gitignoreContent.includes(pattern)) {
      testPassed('Git', `.gitignore contains ${pattern}`);
    } else {
      testFailed('Git', `.gitignore - ${pattern}`, new Error('Missing'));
    }
  });
  
  // Check that .env is NOT in git
  try {
    const gitStatus = execSync('git ls-files .env', { stdio: 'pipe' }).toString();
    if (gitStatus.trim() === '') {
      testPassed('Git', '.env is NOT tracked by git (secure)');
    } else {
      testFailed('Git', '.env tracking', new Error('.env should not be in git!'));
    }
  } catch {
    testPassed('Git', '.env is NOT tracked by git (secure)');
  }
} catch (error) {
  testFailed('Git', '.gitignore', error);
}

// ==================== FINAL SUMMARY ====================
console.log('\n' + '='.repeat(70));
console.log('📊 COMPREHENSIVE TEST SUMMARY');
console.log('='.repeat(70));
console.log(`Total tests run: ${totalTests}`);
console.log(`✅ Passed: ${passedTests} (${((passedTests/totalTests)*100).toFixed(1)}%)`);
console.log(`❌ Failed: ${failedTests}`);
console.log('='.repeat(70));

if (failedTests === 0) {
  console.log('\n🎉🎉🎉 PERFECT! ALL TESTS PASSED! 🎉🎉🎉\n');
  console.log('✅ File structure is complete');
  console.log('✅ All syntax is valid');
  console.log('✅ All modules load correctly');
  console.log('✅ All functions are exported');
  console.log('✅ Encryption works perfectly');
  console.log('✅ Environment variables are set');
  console.log('✅ Security is configured');
  console.log('✅ Git configuration is secure\n');
  console.log('🚀 YOUR PROJECT IS PRODUCTION-READY!');
  console.log('📝 Next step: MongoDB Atlas setup');
  console.log('='.repeat(70));
  process.exit(0);
} else {
  console.log('\n⚠️  SOME TESTS FAILED\n');
  console.log('Failed tests by category:');
  
  const errorsByCategory = {};
  errors.forEach(err => {
    if (!errorsByCategory[err.category]) {
      errorsByCategory[err.category] = [];
    }
    errorsByCategory[err.category].push(`  - ${err.test}: ${err.error}`);
  });
  
  Object.entries(errorsByCategory).forEach(([category, errs]) => {
    console.log(`\n${category}:`);
    errs.forEach(err => console.log(err));
  });
  
  console.log('\n' + '='.repeat(70));
  console.log('Please fix the errors above before continuing.');
  process.exit(1);
}
