/**
 * Auth Status Controller
 * Provides authentication status check endpoint
 * Used by ChatGPT to verify if user is logged in
 */

/**
 * Get authentication status
 * GET /api/auth/status
 * 
 * Returns user info if authenticated, triggers OAuth if not
 */
async function getAuthStatus(req, res) {
  try {
    // User info is already attached by authMiddleware
    const { email, googleSub } = req.user;

    console.log('✅ [AUTH_STATUS] User is authenticated:', email);

    return res.json({
      authenticated: true,
      email: email,
      message: `✅ Přihlášen jako ${email}`,
      google_sub: googleSub
    });

  } catch (error) {
    console.error('❌ [AUTH_STATUS_ERROR] Failed to check auth status');
    console.error('Details:', {
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: 'Unable to check authentication status'
    });
  }
}

export { getAuthStatus };
