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

// Full Gmail, Calendar, Drive, and Sheets scopes
const SCOPES = [
  'https://mail.google.com/', // Full Gmail access
  'https://www.googleapis.com/auth/calendar', // Full Calendar access
  'https://www.googleapis.com/auth/drive.file', // Drive access (for finding sheets)
  'https://www.googleapis.com/auth/spreadsheets', // Sheets access (for contacts)
  'https://www.googleapis.com/auth/tasks', // Tasks access
  'openid',
  'email',
  'profile'
];

// Create OAuth2 client
function createOAuthClient() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

function getAuthUrl(state) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to ensure refresh token
    state: state || 'default_state',
    include_granted_scopes: true
  });
}

async function getTokensFromCode(code) {
  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
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
    const client = createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();

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
  createOAuthClient,
  getAuthUrl,
  getTokensFromCode,
  refreshAccessToken,
  SCOPES
};
