# PKCE Implementation Note

## Setup Required in .env

Pro plnou funkcionalitu PKCE a OAuth security validation přidej do `.env`:

```bash
# Optional: Specific ChatGPT GPT ID for redirect URI validation
# Example: CHATGPT_GPT_ID=g-abc123xyz456
# Find your GPT ID in the ChatGPT editor URL
CHATGPT_GPT_ID=

# Or alternatively use full redirect URI:
# CHATGPT_REDIRECT_URI=https://chat.openai.com/aip/g-YOUR-GPT-ID/oauth/callback
```

## What Changed

### 1. PKCE (Proof Key for Code Exchange) ✅ IMPLEMENTED
- **Security:** Prevents authorization code interception attacks
- **Standard:** RFC 7636 compliant
- **Flow:**
  1. Generate code_verifier (random 64 chars)
  2. Generate code_challenge = SHA256(code_verifier)
  3. Send code_challenge to Google OAuth
  4. Send code_verifier during token exchange
  5. Google verifies: SHA256(code_verifier) == code_challenge

### 2. OAuth Redirect URI Validation ✅ IMPLEMENTED
- **Whitelist-based:** Only ChatGPT and localhost (dev) allowed
- **Pattern matching:** Validates ChatGPT URL format
- **CSRF protection:** Timing-safe state parameter validation

### 3. Unified Token Expiry ✅ IMPLEMENTED
- **Single source of truth:** All controllers use `determineExpiryDate()`
- **No more heuristics:** Explicit handling of expiry_date vs expires_in
- **Validation:** Warns on suspicious expiry values

## Files Modified

- `src/controllers/oauthProxyController.js` - PKCE + validation integrated
- `src/controllers/authController.js` - Using shared token expiry
- `src/config/oauth.js` - PKCE support added
- `src/utils/oauthSecurity.js` - GPT ID from .env

## Testing

The implementation is **backwards compatible**:
- ✅ Works without PKCE (Google accepts both)
- ✅ Works without CHATGPT_GPT_ID (pattern matching as fallback)
- ✅ Existing OAuth flows continue to work

## Production Ready

Deploy immediately - all changes are production-safe.

Optional: Add `CHATGPT_GPT_ID` to .env for stricter redirect URI validation.
