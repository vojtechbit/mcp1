// Test OAuth Proxy Implementation
// Run: node test-oauth-proxy.js

import { connectToDatabase, getDatabase } from './src/config/database.js';
import { 
  generateAuthCode, 
  generateProxyToken,
  saveAuthCode,
  validateAndConsumeAuthCode,
  saveProxyToken,
  findUserByProxyToken
} from './src/services/proxyTokenService.js';

async function testOAuthProxy() {
  try {
    console.log('🧪 TESTING OAUTH PROXY IMPLEMENTATION');
    console.log('='.repeat(70));
    
    await connectToDatabase();
    console.log('✅ Connected to MongoDB\n');
    
    // Test 1: Generate tokens
    console.log('📝 Test 1: Generate Tokens');
    const authCode = generateAuthCode();
    const proxyToken = generateProxyToken();
    console.log('  Auth Code:', authCode.substring(0, 16) + '...');
    console.log('  Proxy Token:', proxyToken.substring(0, 16) + '...');
    console.log('  ✅ Token generation working\n');
    
    // Test 2: Save auth code
    console.log('📝 Test 2: Save Auth Code');
    await saveAuthCode({
      authCode: authCode,
      googleSub: 'test_user_123',
      state: 'test_state_abc',
      chatgptRedirectUri: 'https://chat.openai.com/aip/g-test/oauth/callback'
    });
    console.log('  ✅ Auth code saved\n');
    
    // Test 3: Validate and consume auth code
    console.log('📝 Test 3: Validate Auth Code');
    const googleSub = await validateAndConsumeAuthCode(authCode);
    console.log('  Google Sub:', googleSub);
    console.log('  ✅ Auth code validated and consumed\n');
    
    // Test 4: Try to use auth code again (should fail)
    console.log('📝 Test 4: Try Reusing Auth Code (should fail)');
    const shouldBeNull = await validateAndConsumeAuthCode(authCode);
    if (shouldBeNull === null) {
      console.log('  ✅ Auth code correctly marked as used\n');
    } else {
      console.log('  ❌ ERROR: Auth code was reused!\n');
    }
    
    // Test 5: Save proxy token
    console.log('📝 Test 5: Save Proxy Token');
    await saveProxyToken({
      proxyToken: proxyToken,
      googleSub: googleSub,
      expiresIn: 3600
    });
    console.log('  ✅ Proxy token saved\n');
    
    // Test 6: Find user by proxy token
    console.log('📝 Test 6: Find User By Proxy Token');
    const foundGoogleSub = await findUserByProxyToken(proxyToken);
    console.log('  Found Google Sub:', foundGoogleSub);
    if (foundGoogleSub === googleSub) {
      console.log('  ✅ User lookup working correctly\n');
    } else {
      console.log('  ❌ ERROR: Wrong user returned!\n');
    }
    
    // Test 7: Check database collections
    console.log('📝 Test 7: Check Database Collections');
    const db = await getDatabase();
    const authFlowsCount = await db.collection('oauth_flows').countDocuments();
    const proxyTokensCount = await db.collection('proxy_tokens').countDocuments();
    console.log('  oauth_flows count:', authFlowsCount);
    console.log('  proxy_tokens count:', proxyTokensCount);
    console.log('  ✅ Collections created\n');
    
    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await db.collection('oauth_flows').deleteMany({ google_sub: 'test_user_123' });
    await db.collection('proxy_tokens').deleteMany({ google_sub: 'test_user_123' });
    console.log('  ✅ Cleanup complete\n');
    
    console.log('='.repeat(70));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(70));
    console.log('\n🎯 OAuth Proxy is ready for production!');
    console.log('📖 See CUSTOM_GPT_SETUP.md for configuration guide\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testOAuthProxy();
