import express from 'express';
import { authorize, callback, token } from '../controllers/oauthProxyController.js';
import { sanitizeForLog } from '../utils/redact.js';

const router = express.Router();

const shouldLogOauthTraffic = String(process.env.OAUTH_REQUEST_LOGGING || '').toLowerCase() === 'true';

if (shouldLogOauthTraffic) {
  router.use((req, res, next) => {
    console.log(`🔵 [OAUTH_ROUTE] ${req.method} ${req.path}`);
    console.log('Query:', sanitizeForLog(req.query));
    console.log('Body:', sanitizeForLog(req.body));
    next();
  });
}

/**
 * OAuth Proxy Routes
 * These endpoints implement OAuth flow for ChatGPT Custom GPT
 */

// Authorization endpoint - ChatGPT redirects here to start OAuth
// GET /oauth/authorize?client_id=...&redirect_uri=...&state=...&scope=...
router.get('/authorize', authorize);

// Callback endpoint - Google redirects here after user consent
// GET /oauth/callback?code=...&state=...
router.get('/callback', callback);

// Token exchange endpoint - ChatGPT calls this to get access token
// POST /oauth/token (OAuth 2.0 standard)
// Body: { grant_type, code, client_id, client_secret, redirect_uri }
router.post('/token', token);

// Also support GET for debugging (some OAuth clients might use GET)
router.get('/token', (req, res) => {
  console.log('⚠️  WARNING: GET request to /oauth/token - should be POST!');
  console.log('Query params:', req.query);
  res.status(405).json({
    error: 'method_not_allowed',
    error_description: 'Token endpoint only accepts POST requests',
    received_method: 'GET',
    expected_method: 'POST'
  });
});

export default router;
