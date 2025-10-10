// Test token refresh mechanism
import { connectToDatabase, getDatabase } from './src/config/database.js';
import { getUserByGoogleSub, updateTokens } from './src/services/databaseService.js';
import { refreshAccessToken } from './src/config/oauth.js';

async function testRefresh() {
  try {
    console.log('🔄 Connecting to database...');
    await connectToDatabase();
    
    const db = await getDatabase();
    const users = await db.collection('users').find({}).toArray();
    
    if (users.length === 0) {
      console.error('❌ No users found!');
      process.exit(1);
    }
    
    const user = users[0];
    console.log('✅ Found user:', user.email);
    console.log('📅 Token expiry:', new Date(user.token_expiry));
    console.log('⏰ Current time:', new Date());
    
    const now = new Date();
    const expiry = new Date(user.token_expiry);
    
    if (now < expiry) {
      console.log('✅ Token is still valid - no refresh needed!');
    } else {
      console.log('⚠️  Token expired - refreshing...');
    }
    
    console.log('\n🔄 Testing token refresh...');
    
    // Get user with decrypted tokens
    const userData = await getUserByGoogleSub(user.google_sub);
    
    // Try to refresh
    const newTokens = await refreshAccessToken(userData.refreshToken);
    
    console.log('✅ Token refresh successful!');
    console.log('New access token (first 20 chars):', newTokens.access_token.substring(0, 20) + '...');
    
    // Save to database
    const expiryDate = new Date(Date.now() + (newTokens.expiry_date || 3600 * 1000));
    
    await updateTokens(user.google_sub, {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || userData.refreshToken,
      expiryDate
    });
    
    console.log('✅ New tokens saved to database!');
    console.log('📅 New expiry:', expiryDate);
    console.log('\n🎉 Refresh test successful!\n');
    console.log('Now try: node test-send-email.js');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Refresh failed:', error.message);
    console.error('\n💡 Solution: Re-authenticate via OAuth:');
    console.error('   1. npm start');
    console.error('   2. Open: http://localhost:3000/auth/google');
    console.error('   3. Try test again\n');
    process.exit(1);
  }
}

testRefresh();
