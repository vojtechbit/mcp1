import express from 'express';
import { getUserByGoogleSub } from '../services/databaseService.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Debug endpoint - Check token status
 * GET /api/debug/token-status
 */
router.get('/token-status', verifyToken, async (req, res) => {
  try {
    const user = await getUserByGoogleSub(req.user.googleSub);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        googleSub: req.user.googleSub
      });
    }

    const now = new Date();
    const expiry = new Date(user.tokenExpiry);
    const timeUntilExpiry = expiry.getTime() - now.getTime();
    const isExpired = timeUntilExpiry <= 0;
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    const needsRefresh = timeUntilExpiry <= bufferTime;

    res.json({
      status: 'ok',
      user: {
        email: user.email,
        googleSub: user.googleSub
      },
      token: {
        hasAccessToken: Boolean(user.accessToken),
        hasRefreshToken: Boolean(user.refreshToken),
        expiry: user.tokenExpiry,
        expiryDate: expiry.toISOString(),
        currentTime: now.toISOString(),
        secondsUntilExpiry: Math.floor(timeUntilExpiry / 1000),
        isExpired,
        needsRefresh: needsRefresh && !isExpired,
        status: isExpired ? '❌ EXPIRED' : needsRefresh ? '⚠️ NEEDS REFRESH' : '✅ VALID'
      },
      lastUsed: user.lastUsed,
      createdAt: user.createdAt
    });

  } catch (error) {
    console.error('❌ Failed to get token status');
    console.error('Error:', {
      message: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Failed to get token status',
      message: error.message
    });
  }
});

export default router;
