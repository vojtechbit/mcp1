import { getDatabase } from '../config/database.js';
import { encryptToken, decryptToken } from './tokenService.js';

/**
 * Save or update user with encrypted tokens
 */
async function saveUser(userData) {
  try {
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
      last_used: new Date()
    };

    const result = await users.updateOne(
      { google_sub: googleSub },
      { 
        $set: userDoc,
        $setOnInsert: { created_at: new Date() }
      },
      { upsert: true }
    );

    console.log('✅ User saved to database:', email);
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
    const db = await getDatabase();
    const users = db.collection('users');

    const user = await users.findOne({ google_sub: googleSub });

    if (!user) {
      console.log('⚠️  User not found:', googleSub);
      return null;
    }

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
      lastUsed: user.last_used
    };
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
    const db = await getDatabase();
    const users = db.collection('users');

    const encryptedAccess = encryptToken(tokens.accessToken);

    const updateDoc = {
      encrypted_access_token: encryptedAccess.encryptedToken,
      access_token_iv: encryptedAccess.iv,
      access_token_auth_tag: encryptedAccess.authTag,
      token_expiry: tokens.expiryDate,
      updated_at: new Date(),
      last_used: new Date()
    };

    if (tokens.refreshToken) {
      const encryptedRefresh = encryptToken(tokens.refreshToken);
      updateDoc.encrypted_refresh_token = encryptedRefresh.encryptedToken;
      updateDoc.refresh_token_iv = encryptedRefresh.iv;
      updateDoc.refresh_token_auth_tag = encryptedRefresh.authTag;
    }

    await users.updateOne(
      { google_sub: googleSub },
      { $set: updateDoc }
    );

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
    const db = await getDatabase();
    const users = db.collection('users');

    const result = await users.deleteOne({ google_sub: googleSub });

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
    const db = await getDatabase();
    const users = db.collection('users');

    await users.updateOne(
      { google_sub: googleSub },
      { $set: { last_used: new Date() } }
    );
  } catch (error) {
    console.error('⚠️  Failed to update last_used:', error.message);
  }
}

export {
  saveUser,
  getUserByGoogleSub,
  updateTokens,
  deleteUser,
  updateLastUsed
};
