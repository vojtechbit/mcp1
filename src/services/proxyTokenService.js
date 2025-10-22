import crypto from 'crypto';
import { getDatabase } from '../config/database.js';
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';

/**
 * Generate random authorization code for ChatGPT OAuth flow
 * Single use, expires in 10 minutes
 */
function generateAuthCode() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate random proxy token for ChatGPT API calls
 * Long-lived, used for all subsequent requests
 */
function generateProxyToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Save authorization code to database
 * Used during OAuth flow to exchange for access token
 */
async function saveAuthCode({ authCode, googleSub, state, chatgptRedirectUri }) {
  try {
    const db = await getDatabase();
    const oauthFlows = db.collection('oauth_flows');

    const authFlow = {
      auth_code: authCode,
      google_sub: googleSub,
      state: state,
      chatgpt_redirect_uri: chatgptRedirectUri,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      used: false
    };

    await oauthFlows.insertOne(authFlow);

    console.log('✅ Auth code saved:', authCode.substring(0, 8) + '...');
    return authCode;
  } catch (error) {
    console.error('❌ [PROXY_TOKEN_ERROR] Failed to save auth code');
    console.error('Details:', {
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Validate and consume authorization code
 * Returns google_sub if valid, null if invalid/expired/used
 */
async function validateAndConsumeAuthCode(authCode) {
  try {
    const db = await getDatabase();
    const oauthFlows = db.collection('oauth_flows');

    const authFlow = await oauthFlows.findOne({ auth_code: authCode });

    if (!authFlow) {
      console.log('⚠️  Auth code not found:', authCode.substring(0, 8) + '...');
      return null;
    }

    // Check if already used
    if (authFlow.used) {
      console.log('⚠️  Auth code already used:', authCode.substring(0, 8) + '...');
      return null;
    }

    // Check if expired
    if (new Date() > authFlow.expires_at) {
      console.log('⚠️  Auth code expired:', authCode.substring(0, 8) + '...');
      return null;
    }

    // Mark as used
    await oauthFlows.updateOne(
      { auth_code: authCode },
      { 
        $set: { 
          used: true,
          used_at: new Date()
        } 
      }
    );

    console.log('✅ Auth code validated and consumed:', authCode.substring(0, 8) + '...');
    return authFlow.google_sub;
  } catch (error) {
    console.error('❌ [PROXY_TOKEN_ERROR] Failed to validate auth code');
    console.error('Details:', {
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Save proxy token to database
 * Used by ChatGPT for all API calls
 */
async function saveProxyToken({ proxyToken, googleSub, expiresIn = 2592000 }) {
  try {
    const db = await getDatabase();
    const proxyTokens = db.collection('proxy_tokens');

    const tokenDoc = {
      proxy_token: proxyToken,
      google_sub: googleSub,
      created_at: new Date(),
      expires_at: new Date(Date.now() + expiresIn * 1000), // expiresIn is in seconds
      last_used: new Date()
    };

    await proxyTokens.insertOne(tokenDoc);

    console.log('✅ Proxy token saved for user:', googleSub);
    return proxyToken;
  } catch (error) {
    console.error('❌ [PROXY_TOKEN_ERROR] Failed to save proxy token');
    console.error('Details:', {
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Find user by proxy token
 * Returns google_sub if valid, null if invalid/expired
 */
async function findUserByProxyToken(proxyToken) {
  try {
    const db = await getDatabase();
    const proxyTokens = db.collection('proxy_tokens');

    const tokenDoc = await proxyTokens.findOne({ proxy_token: proxyToken });

    if (!tokenDoc) {
      console.log('⚠️  Proxy token not found');
      return null;
    }

    // Check if expired
    if (new Date() > tokenDoc.expires_at) {
      console.log('⚠️  Proxy token expired');
      return null;
    }

    // Update last_used timestamp
    await proxyTokens.updateOne(
      { proxy_token: proxyToken },
      { $set: { last_used: new Date() } }
    );

    console.log('✅ Proxy token validated for user:', tokenDoc.google_sub);
    return tokenDoc.google_sub;
  } catch (error) {
    console.error('❌ [PROXY_TOKEN_ERROR] Failed to find user by proxy token');
    console.error('Details:', {
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Clean up expired auth codes and tokens
 * Run this periodically (e.g., daily cron job)
 */
async function cleanupExpiredTokens() {
  try {
    const db = await getDatabase();
    const now = new Date();

    // Clean up expired auth codes
    const authCodesResult = await db.collection('oauth_flows').deleteMany({
      expires_at: { $lt: now }
    });

    // Clean up expired proxy tokens
    const proxyTokensResult = await db.collection('proxy_tokens').deleteMany({
      expires_at: { $lt: now }
    });

    console.log('✅ Cleanup complete:', {
      authCodesDeleted: authCodesResult.deletedCount,
      proxyTokensDeleted: proxyTokensResult.deletedCount
    });

    return {
      authCodesDeleted: authCodesResult.deletedCount,
      proxyTokensDeleted: proxyTokensResult.deletedCount
    };
  } catch (error) {
    console.error('❌ [PROXY_TOKEN_ERROR] Failed to clean up expired tokens');
    console.error('Details:', {
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

const traced = wrapModuleFunctions('services.proxyTokenService', {
  generateAuthCode,
  generateProxyToken,
  saveAuthCode,
  validateAndConsumeAuthCode,
  saveProxyToken,
  findUserByProxyToken,
  cleanupExpiredTokens
});

const {
  generateAuthCode: tracedGenerateAuthCode,
  generateProxyToken: tracedGenerateProxyToken,
  saveAuthCode: tracedSaveAuthCode,
  validateAndConsumeAuthCode: tracedValidateAndConsumeAuthCode,
  saveProxyToken: tracedSaveProxyToken,
  findUserByProxyToken: tracedFindUserByProxyToken,
  cleanupExpiredTokens: tracedCleanupExpiredTokens
} = traced;

export {
  tracedGenerateAuthCode as generateAuthCode,
  tracedGenerateProxyToken as generateProxyToken,
  tracedSaveAuthCode as saveAuthCode,
  tracedValidateAndConsumeAuthCode as validateAndConsumeAuthCode,
  tracedSaveProxyToken as saveProxyToken,
  tracedFindUserByProxyToken as findUserByProxyToken,
  tracedCleanupExpiredTokens as cleanupExpiredTokens
};
