import express from 'express';
import { initiateOAuth, handleCallback, checkStatus } from '../controllers/authController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Auth Routes
 * All routes for OAuth flow
 */

// Initiate OAuth flow - redirect to Google consent screen
router.get('/google', initiateOAuth);

// OAuth callback - handle redirect from Google
router.get('/google/callback', handleCallback);

// Check authentication status (protected)
router.get('/status', verifyToken, checkStatus);

export default router;
