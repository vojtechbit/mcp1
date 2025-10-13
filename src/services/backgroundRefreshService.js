import { getUserByGoogleSub, updateTokens } from './databaseService.js';
import { refreshAccessToken } from '../config/oauth.js';
import { getDatabase } from '../config/database.js';

/**
 * Background Token Refresh Service
 */

let refreshInterval = null;

/**
 * Refresh tokens for ALL users on server startup
 * Perfect for Render free tier cold starts
 */
async function refreshAllTokensOnStartup() {
  try {
    const db = await getDatabase();
    const users = db.collection('users');

    const allUsers = await users.find({}).toArray();

    if (allUsers.length === 0) {
      console.log('⚪ No users to refresh');
      return;
    }

    console.log(`🔄 Cold start detected - refreshing tokens for ${allUsers.length} users...`);

    let successCount = 0;
    let failCount = 0;

    for (const user of allUsers) {
      try {
        const userData = await getUserByGoogleSub(user.google_sub);
        
        if (!userData || !userData.refreshToken) {
          failCount++;
          continue;
        }

        const newTokens = await refreshAccessToken(userData.refreshToken);
        
        let expiryDate;
        const expiryValue = newTokens.expiry_date || 3600;
        if (expiryValue > 946684800) {
          expiryDate = new Date(expiryValue);
        } else {
          expiryDate = new Date(Date.now() + (expiryValue * 1000));
        }

        await updateTokens(user.google_sub, {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token || userData.refreshToken,
          expiryDate
        });

        successCount++;

      } catch (error) {
        console.error(`❌ Failed refresh for ${user.email}:`, error.message);
        failCount++;
      }
    }

    console.log(`✅ Startup refresh: ${successCount} success, ${failCount} failed`);

  } catch (error) {
    console.error('❌ Startup token refresh failed:', error.message);
  }
}

/**
 * Refresh tokens for active users (background job)
 */
async function refreshAllActiveTokens() {
  try {
    const db = await getDatabase();
    const users = db.collection('users');

    // Find users active in last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeUsers = await users.find({
      last_used: { $gte: yesterday }
    }).toArray();

    if (activeUsers.length === 0) {
      console.log('⚪ No active users to refresh');
      return;
    }

    console.log(`🔄 Refreshing tokens for ${activeUsers.length} active users...`);

    let successCount = 0;
    let failCount = 0;

    for (const user of activeUsers) {
      try {
        const now = new Date();
        const expiry = new Date(user.token_expiry);
        const timeUntilExpiry = expiry.getTime() - now.getTime();
        const hoursUntilExpiry = timeUntilExpiry / (1000 * 60 * 60);

        // Skip if token is still valid for >2 hours
        if (hoursUntilExpiry > 2) {
          console.log(`⏭️  Skipping ${user.email} (expires in ${hoursUntilExpiry.toFixed(1)}h)`);
          continue;
        }

        console.log(`🔄 Refreshing token for ${user.email} (expires in ${hoursUntilExpiry.toFixed(1)}h)...`);

        // Get full user data with decrypted tokens
        const userData = await getUserByGoogleSub(user.google_sub);
        
        if (!userData || !userData.refreshToken) {
          console.log(`⚠️  No refresh token for ${user.email}`);
          failCount++;
          continue;
        }

        // Refresh the token
        const newTokens = await refreshAccessToken(userData.refreshToken);
        
        let expiryDate;
        const expiryValue = newTokens.expiry_date || 3600;
        if (expiryValue > 946684800) {
          expiryDate = new Date(expiryValue);
        } else {
          expiryDate = new Date(Date.now() + (expiryValue * 1000));
        }

        await updateTokens(user.google_sub, {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token || userData.refreshToken,
          expiryDate
        });

        console.log(`✅ Refreshed token for ${user.email}`);
        successCount++;

      } catch (error) {
        console.error(`❌ Failed to refresh token for ${user.email}:`, error.message);
        failCount++;
      }
    }

    console.log(`✅ Background refresh complete: ${successCount} success, ${failCount} failed`);

  } catch (error) {
    console.error('❌ Background token refresh failed:', error.message);
  }
}

/**
 * Start background token refresh
 * Runs every 30 minutes while server is active
 * 
 * NOTE: On Render free tier, this only runs while server is awake
 */
function startBackgroundRefresh() {
  if (refreshInterval) {
    console.log('⚠️  Background refresh already running');
    return;
  }

  console.log('🚀 Starting background token refresh (every 30 minutes)');
  console.log('⚠️  Note: On Render free tier, this only works while server is awake');

  // Run immediately on start
  setTimeout(() => refreshAllActiveTokens(), 5000); // Wait 5s for server to fully start

  // Then run every 30 minutes
  refreshInterval = setInterval(() => {
    refreshAllActiveTokens();
  }, 30 * 60 * 1000); // 30 minutes
}

/**
 * Stop background token refresh
 */
function stopBackgroundRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log('🛑 Background token refresh stopped');
  }
}

export {
  refreshAllTokensOnStartup,
  refreshAllActiveTokens,
  startBackgroundRefresh,
  stopBackgroundRefresh
};
