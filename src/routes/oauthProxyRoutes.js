import express from 'express';
import { authorize, callback, token } from '../controllers/oauthProxyController.js';

const router = express.Router();

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
// POST /oauth/token
// Body: { grant_type, code, client_id, client_secret, redirect_uri }
router.post('/token', token);

export default router;
