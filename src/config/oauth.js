import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// Validate required environment variables
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !REDIRECT_URI) {
  console.error('❌ Missing required Google OAuth credentials in .env:');
  if (!GOOGLE_CLIENT_ID) console.error('  - GOOGLE_CLIENT_ID');
  if (!GOOGLE_CLIENT_SECRET) console.error('  - GOOGLE_CLIENT_SECRET');
  if (!REDIRECT_URI) console.error('  - REDIRECT_URI');
  process.exit(1);
}

// Full Gmail and Calendar scopes
const SCOPES = [
  'https://mail.google.com/', // Full Gmail access
  'https://www.googleapis.com/auth/calendar', // Full Calendar access
  'openid',
  'email',
  'profile'
];

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

function getAuthUrl(state) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to ensure refresh token
    state: state || 'default_state',
    include_granted_scopes: true
  });
}

async function getTokensFromCode(code) {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (error) {
    console.error('❌ [OAUTH_ERROR] Failed to exchange authorization code for tokens');
    console.error('Details:', {
      errorMessage: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

async function refreshAccessToken(refreshToken) {
  try {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    console.log('✅ Access token refreshed successfully');
    return credentials;
  } catch (error) {
    console.error('❌ [TOKEN_REFRESH_ERROR] Failed to refresh access token');
    console.error('Details:', {
      errorMessage: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

export {
  oauth2Client,
  getAuthUrl,
  getTokensFromCode,
  refreshAccessToken,
  SCOPES
};
