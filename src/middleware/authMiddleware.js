import { google } from 'googleapis';
import dotenv from 'dotenv';

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

    // Validate token with Google userinfo endpoint
    console.log('🔐 Validating user token...');
    
    const oauth2 = google.oauth2({ version: 'v2', auth: token });
    
    let userInfo;
    try {
      const response = await oauth2.userinfo.get();
      userInfo = response.data;
    } catch (error) {
      console.error('❌ [AUTH_ERROR] Token validation failed');
      console.error('Details:', {
        errorMessage: error.message,
        statusCode: error.response?.status,
        timestamp: new Date().toISOString()
      });

      // Check for specific error types
      if (error.response?.status === 401) {
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
      picture: userInfo.picture
    };

    console.log(`✅ User authenticated: ${email} (${googleSub})`);
    
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

export { verifyToken, requireDatabaseUser };
