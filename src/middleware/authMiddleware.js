import { google } from 'googleapis';
import dotenv from 'dotenv';
import { findUserByProxyToken } from '../services/proxyTokenService.js';
import {
  cacheAccessTokenIdentity,
  getCachedIdentityForAccessToken,
  invalidateCachedIdentity
} from '../services/tokenIdentityService.js';
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';

dotenv.config();

/**
 * Middleware to verify ChatGPT user token and identify user
 * 
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Validate token with Google userinfo endpoint
 * 3. Extract google_sub (user ID)
 * 4. Attach user info to req.user
 * 5. Continue to next middleware/controller
 */
async function fetchGoogleUserInfo(token) {
  const { OAuth2 } = google.auth;
  const oauth2Client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  oauth2Client.setCredentials({ access_token: token });

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });

  const response = await oauth2.userinfo.get();
  return response.data;
}

async function verifyToken(req, res, next) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ [AUTH_ERROR] Missing or invalid Authorization header');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization token'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      console.error('❌ [AUTH_ERROR] Token not found in Authorization header');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authorization token is required'
      });
    }

    // STRATEGY 1: Try to find user by proxy token (ChatGPT flow)
    console.log('🔐 Checking if token is a proxy token...');
    const googleSubFromProxy = await findUserByProxyToken(token);
    
    if (googleSubFromProxy) {
      // Token is a valid proxy token - get user info from database
      console.log('✅ Valid proxy token found');
      
      const { getUserByGoogleSub } = await import('../services/databaseService.js');
      const user = await getUserByGoogleSub(googleSubFromProxy);
      
      if (!user) {
        console.error('❌ [AUTH_ERROR] User not found in database for proxy token');
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User not found'
        });
      }
      
      // Attach user info to request
      req.user = {
        googleSub: user.googleSub,
        email: user.email,
        name: user.email.split('@')[0],
        picture: null,
        accessToken: user.accessToken,
        refreshToken: user.refreshToken,
        tokenType: 'proxy'
      };
      
      console.log(`✅ User authenticated via proxy token: ${user.email}`);
      return next();
    }
    
    // STRATEGY 2: Try cached access token identity (non-proxy flow)
    const cachedIdentity = await getCachedIdentityForAccessToken(token);

    if (cachedIdentity && !cachedIdentity.shouldRevalidate) {
      console.log('✅ Reused cached access token identity');

      let email = cachedIdentity.email;
      let dbUser = null;

      if (!email) {
        const { getUserByGoogleSub } = await import('../services/databaseService.js');
        dbUser = await getUserByGoogleSub(cachedIdentity.googleSub);
        email = dbUser?.email || null;
      }

      req.user = {
        googleSub: cachedIdentity.googleSub,
        email,
        name: email ? email.split('@')[0] : cachedIdentity.googleSub,
        picture: null,
        accessToken: token,
        tokenType: 'google-cache'
      };

      if (dbUser?.refreshToken) {
        req.user.refreshToken = dbUser.refreshToken;
      }

      return next();
    }

    const usingRevalidation = Boolean(cachedIdentity);
    if (usingRevalidation) {
      console.log('♻️  Cached access token identity requires revalidation, contacting Google...');
    } else {
      console.log('🔐 Token is not a proxy token, validating with Google...');
    }

    let userInfo;
    try {
      userInfo = await fetchGoogleUserInfo(token);
    } catch (error) {
      console.error('❌ [AUTH_ERROR] Token validation failed');
      console.error('Details:', {
        errorMessage: error.message,
        statusCode: error.response?.status,
        timestamp: new Date().toISOString()
      });

      if (error.response?.status === 401) {
        await invalidateCachedIdentity(token).catch(cacheError =>
          console.warn('⚠️  Failed to invalidate cached identity after 401:', cacheError.message)
        );
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        });
      }

      return res.status(500).json({
        error: 'Authentication failed',
        message: 'Unable to verify token'
      });
    }

    // Extract user identification
    const googleSub = userInfo.id;
    const email = userInfo.email;

    if (!googleSub) {
      console.error('❌ [AUTH_ERROR] Google sub not found in token');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token format'
      });
    }

    // Attach user info to request
    req.user = {
      googleSub,
      email,
      name: userInfo.name,
      picture: userInfo.picture,
      accessToken: token,
      tokenType: usingRevalidation ? 'google-revalidated' : 'google'
    };

    console.log(`✅ User authenticated via Google token: ${email} (${googleSub})`)

    await cacheAccessTokenIdentity({
      accessToken: token,
      googleSub,
      email,
      source: usingRevalidation ? 'google-userinfo-revalidation' : 'google-userinfo'
    }).catch(cacheError =>
      console.warn('⚠️  Failed to cache access token identity:', cacheError.message)
    );

    // Continue to next middleware/controller
    next();

  } catch (error) {
    console.error('❌ [AUTH_ERROR] Unexpected error in authentication');
    console.error('Details:', {
      errorMessage: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Optional middleware to check if user exists in database
 * Use this after verifyToken for endpoints that require prior OAuth setup
 */
async function requireDatabaseUser(req, res, next) {
  try {
    const { getUserByGoogleSub } = await import('../services/databaseService.js');
    
    const user = await getUserByGoogleSub(req.user.googleSub);

    if (!user) {
      console.log('⚠️  User not found in database:', req.user.email);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User not authenticated with Google. Please complete OAuth flow first.',
        action: 'redirect_to_oauth'
      });
    }

    // User exists in database
    req.user.dbExists = true;
    next();

  } catch (error) {
    console.error('❌ [AUTH_ERROR] Database check failed');
    console.error('Details:', {
      googleSub: req.user.googleSub,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Unable to verify user status'
    });
  }
}

const traced = wrapModuleFunctions('middleware.authMiddleware', {
  verifyToken,
  requireDatabaseUser,
});

const {
  verifyToken: tracedVerifyToken,
  requireDatabaseUser: tracedRequireDatabaseUser,
} = traced;

export {
  tracedVerifyToken as verifyToken,
  tracedRequireDatabaseUser as requireDatabaseUser,
};
