import { getDatabase } from '../config/database.js';
import { encryptToken, decryptToken } from './tokenService.js';
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';

/**
 * Retry wrapper for database operations
 */
async function withDbRetry(operation, operationName = 'db operation', maxAttempts = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation();
      return result;
    } catch (error) {
      lastError = error;
      
      if (
        error.message?.includes('collection') || 
        error.message?.includes('not a function') ||
        error.message?.includes('not initialized')
      ) {
        if (attempt < maxAttempts) {
          console.warn(`⏳ ${operationName} attempt ${attempt}/${maxAttempts} failed, retrying in 300ms...`);
          await new Promise(resolve => setTimeout(resolve, 300));
          continue;
        }
      }
      
      console.error(`[ERROR] ${operationName} all attempts failed. Final error:`, error.message);
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * Save or update user with encrypted tokens
 */
async function saveUser(userData) {
  try {
    const result = await withDbRetry(async () => {
      const db = await getDatabase();
      const users = db.collection('users');

    const { googleSub, email, accessToken, refreshToken, expiryDate } = userData;

    const encryptedAccess = encryptToken(accessToken);
    const encryptedRefresh = encryptToken(refreshToken);

    const userDoc = {
      google_sub: googleSub,
      email: email,
      encrypted_access_token: encryptedAccess.encryptedToken,
      access_token_iv: encryptedAccess.iv,
      access_token_auth_tag: encryptedAccess.authTag,
      encrypted_refresh_token: encryptedRefresh.encryptedToken,
      refresh_token_iv: encryptedRefresh.iv,
      refresh_token_auth_tag: encryptedRefresh.authTag,
      token_expiry: expiryDate,
      updated_at: new Date(),
      last_used: new Date(),
      refresh_token_revoked: false
    };

      return await users.updateOne(
        { google_sub: googleSub },
        {
          $set: userDoc,
          $setOnInsert: { created_at: new Date() },
          $unset: { refresh_error: '' }
        },
        { upsert: true }
      );
    }, 'saveUser');

    console.log('✅ User saved to database:', userData.email);
    return result;
  } catch (error) {
    console.error('❌ [DATABASE_ERROR] Failed to save user');
    console.error('Details:', {
      email: userData.email,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Get user by Google Sub (user ID)
 */
async function getUserByGoogleSub(googleSub) {
  try {
    const user = await withDbRetry(async () => {
      const db = await getDatabase();
      const users = db.collection('users');
      return await users.findOne({ google_sub: googleSub });
    }, 'getUserByGoogleSub');

    if (!user) {
      console.log('⚠️  User not found:', googleSub);
      return null;
    }

    try {
      const accessToken = decryptToken(
        user.encrypted_access_token,
        user.access_token_iv,
        user.access_token_auth_tag
      );

      const refreshToken = decryptToken(
        user.encrypted_refresh_token,
        user.refresh_token_iv,
        user.refresh_token_auth_tag
      );

      return {
        googleSub: user.google_sub,
        email: user.email,
        accessToken,
        refreshToken,
        tokenExpiry: user.token_expiry,
        createdAt: user.created_at,
        lastUsed: user.last_used,
        refreshTokenRevoked: user.refresh_token_revoked || false
      };
    } catch (decryptError) {
      console.error('❌ Token decryption failed:', decryptError.message);
      throw decryptError;
    }
  } catch (error) {
    console.error('❌ [DATABASE_ERROR] Failed to get user');
    console.error('Details:', {
      googleSub,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Update user tokens after refresh
 */
async function updateTokens(googleSub, tokens) {
  try {
    await withDbRetry(async () => {
      const db = await getDatabase();
      const users = db.collection('users');

      const encryptedAccess = encryptToken(tokens.accessToken);

      const updateDoc = {
        encrypted_access_token: encryptedAccess.encryptedToken,
        access_token_iv: encryptedAccess.iv,
        access_token_auth_tag: encryptedAccess.authTag,
        token_expiry: tokens.expiryDate,
        updated_at: new Date(),
        last_used: new Date(),
        refresh_token_revoked: false
      };

      if (tokens.refreshToken) {
        const encryptedRefresh = encryptToken(tokens.refreshToken);
        updateDoc.encrypted_refresh_token = encryptedRefresh.encryptedToken;
        updateDoc.refresh_token_iv = encryptedRefresh.iv;
        updateDoc.refresh_token_auth_tag = encryptedRefresh.authTag;
      }

      return await users.updateOne(
        { google_sub: googleSub },
        {
          $set: updateDoc,
          $unset: { refresh_error: '' }
        }
      );
    }, 'updateTokens');

    console.log('✅ Tokens updated for user:', googleSub);
  } catch (error) {
    console.error('❌ [DATABASE_ERROR] Failed to update tokens');
    console.error('Details:', {
      googleSub,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Delete user (GDPR compliance)
 */
async function deleteUser(googleSub) {
  try {
    const result = await withDbRetry(async () => {
      const db = await getDatabase();
      const users = db.collection('users');
      return await users.deleteOne({ google_sub: googleSub });
    }, 'deleteUser');

    if (result.deletedCount > 0) {
      console.log('✅ User deleted:', googleSub);
    } else {
      console.log('⚠️  User not found for deletion:', googleSub);
    }

    return result;
  } catch (error) {
    console.error('❌ [DATABASE_ERROR] Failed to delete user');
    console.error('Details:', {
      googleSub,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Update last used timestamp
 */
async function updateLastUsed(googleSub) {
  try {
    await withDbRetry(async () => {
      const db = await getDatabase();
      const users = db.collection('users');
      return await users.updateOne(
        { google_sub: googleSub },
        { $set: { last_used: new Date() } }
      );
    }, 'updateLastUsed', 2); // Only 2 attempts for this non-critical operation
  } catch (error) {
    console.error('⚠️  Failed to update last_used:', error.message);
  }
}

const traced = wrapModuleFunctions('services.databaseService', {
  saveUser,
  getUserByGoogleSub,
  updateTokens,
  deleteUser,
  updateLastUsed,
});

const {
  saveUser: tracedSaveUser,
  getUserByGoogleSub: tracedGetUserByGoogleSub,
  updateTokens: tracedUpdateTokens,
  deleteUser: tracedDeleteUser,
  updateLastUsed: tracedUpdateLastUsed,
} = traced;

export {
  tracedSaveUser as saveUser,
  tracedGetUserByGoogleSub as getUserByGoogleSub,
  tracedUpdateTokens as updateTokens,
  tracedDeleteUser as deleteUser,
  tracedUpdateLastUsed as updateLastUsed,
};
