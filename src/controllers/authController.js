import { getAuthUrl, getTokensFromCode } from '../config/oauth.js';
import { saveUser } from '../services/databaseService.js';
import { handleControllerError } from '../utils/errors.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Initiate OAuth flow
 * GET /auth/google
 */
async function initiateOAuth(req, res) {
  try {
    // Generate random state for CSRF protection
    const state = Math.random().toString(36).substring(7);
    
    // Get authorization URL
    const authUrl = getAuthUrl(state);
    
    console.log('🔐 Initiating OAuth flow');
    console.log('Redirect URL:', authUrl);

    // Redirect user to Google consent screen
    res.redirect(authUrl);

  } catch (error) {
    return handleControllerError(res, error, {
      context: 'auth.initiateOAuth',
      defaultMessage: 'Unable to start authentication process',
      defaultCode: 'OAUTH_INIT_FAILED'
    });
  }
}

/**
 * Handle OAuth callback from Google
 * GET /auth/google/callback
 */
async function handleCallback(req, res) {
  try {
    const { code, error, state } = req.query;

    // Check if user denied access
    if (error) {
      console.error('❌ [OAUTH_ERROR] User denied access or error occurred');
      console.error('Error:', error);

      return res.status(400).send(`
        <html>
          <head><title>Authentication Failed</title></head>
          <body style="font-family: Arial; padding: 50px; text-align: center;">
            <h1>❌ Authentication Failed</h1>
            <p>You denied access or an error occurred: ${error}</p>
            <p>Please try again.</p>
          </body>
        </html>
      `);
    }

    // Check if authorization code is present
    if (!code) {
      console.error('❌ [OAUTH_ERROR] Authorization code missing');
      
      return res.status(400).send(`
        <html>
          <head><title>Authentication Failed</title></head>
          <body style="font-family: Arial; padding: 50px; text-align: center;">
            <h1>❌ Authentication Failed</h1>
            <p>Authorization code not received.</p>
            <p>Please try again.</p>
          </body>
        </html>
      `);
    }

    console.log('🔄 Exchanging authorization code for tokens...');

    // Exchange authorization code for tokens
    const tokens = await getTokensFromCode(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Access token or refresh token missing from Google response');
    }

    console.log('✅ Tokens received from Google');

    // Get user info from access token
    const { google } = await import('googleapis');
    const { oauth2Client } = await import('../config/oauth.js');
    
    // Set credentials on oauth2Client
    oauth2Client.setCredentials(tokens);
    
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfoResponse = await oauth2.userinfo.get();
    const userInfo = userInfoResponse.data;

    console.log('✅ User info retrieved:', userInfo.email);

    // Calculate token expiry
    // Google OAuth2 returns expiry_date as Unix timestamp in milliseconds
    // and expires_in in seconds
    let expiryDate;
    if (tokens.expiry_date) {
      // expiry_date is already a Unix timestamp in milliseconds
      expiryDate = new Date(tokens.expiry_date);
    } else if (tokens.expires_in) {
      // expires_in is in seconds, convert to milliseconds
      expiryDate = new Date(Date.now() + (tokens.expires_in * 1000));
    } else {
      // Default: 1 hour from now
      expiryDate = new Date(Date.now() + 3600 * 1000);
    }

    // Save user to database with encrypted tokens
    await saveUser({
      googleSub: userInfo.id,
      email: userInfo.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: expiryDate
    });

    console.log('✅ User authenticated and saved to database:', userInfo.email);

    // Success page with auto-close for ChatGPT
    res.send(`
      <html>
        <head>
          <title>Authentication Successful</title>
          <meta http-equiv="refresh" content="3;url=https://chat.openai.com">
        </head>
        <body style="font-family: Arial; padding: 50px; text-align: center;">
          <h1>✅ Authentication Successful!</h1>
          <p>You have successfully connected your Google account.</p>
          <p><strong>${userInfo.email}</strong></p>
          <p>Redirecting back to ChatGPT...</p>
          <script>
            // Try to close window (works if opened by ChatGPT)
            setTimeout(() => {
              window.close();
            }, 2000);
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ [OAUTH_ERROR] Callback handling failed');
    console.error('Details:', {
      errorMessage: error.message,
      errorCode: error.code,
      timestamp: new Date().toISOString()
    });

    res.status(500).send(`
      <html>
        <head><title>Authentication Error</title></head>
        <body style="font-family: Arial; padding: 50px; text-align: center;">
          <h1>❌ Authentication Error</h1>
          <p>Something went wrong during authentication.</p>
          <p>Error: ${error.message}</p>
          <p>Please try again or contact support.</p>
        </body>
      </html>
    `);
  }
}

/**
 * Check authentication status
 * GET /auth/status
 */
async function checkStatus(req, res) {
  try {
    // This endpoint is protected by authMiddleware
    // If we reach here, user is authenticated
    
    res.json({
      authenticated: true,
      user: {
        email: req.user.email,
        googleSub: req.user.googleSub,
        name: req.user.name
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleControllerError(res, error, {
      context: 'auth.checkStatus',
      defaultMessage: 'Unable to verify authentication status',
      defaultCode: 'AUTH_STATUS_FAILED'
    });
  }
}

export { initiateOAuth, handleCallback, checkStatus };
