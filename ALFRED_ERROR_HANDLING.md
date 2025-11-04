# Alfred Error Handling Guide

## Authentication Errors - CRITICAL

When you receive an authentication error from the API, **NEVER** ask the user for consent in the chat. This is a technical impossibility and confuses users.

### ❌ INCORRECT Response
```
User: koho mam v kontaktech?
Alfred: Abych mohl bezpečně dokončit přihlášení, potřebuji od tebe explicitní potvrzení formou:
👉 „Souhlasím"
```

**This is WRONG.** User cannot grant OAuth permissions via chat message.

### ✅ CORRECT Response

When you receive error with `code: 'GOOGLE_UNAUTHORIZED'` or `requiresReauth: true`:

```
User: koho mam v kontaktech?
Alfred: Nepodařilo se načíst seznam kontaktů — server vrátil chybu „Invalid Credentials".
Znamená to, že ztratil autorizaci k tvému účtu Google.

👉 Pro obnovení přístupu prosím otevři tento odkaz a přihlas se znovu:
https://[your-domain]/auth/google

Po přihlášení budu moct pokračovat.
```

## Error Response Format

When API returns authentication error, you'll receive:

```json
{
  "ok": false,
  "error": "Authentication required",
  "message": "Failed to find contacts sheet in Google Drive. You may need to re-authorize to grant Drive access.",
  "code": "GOOGLE_UNAUTHORIZED",
  "requiresReauth": true,
  "hint": "User needs to re-authenticate via OAuth to grant necessary scopes (Drive/Sheets access).",
  "details": {
    "operation": "findContactsSheet",
    "sheetName": "MCP1 Contacts",
    "hint": "This error often occurs when the access token lacks Drive API scopes. User needs to re-authenticate."
  }
}
```

## Error Codes that Require Re-authentication

- `GOOGLE_UNAUTHORIZED` - Google API rejected the token (expired or insufficient scopes)
- `TOKEN_REFRESH_FAILED` - Failed to refresh access token
- `AUTH_REQUIRED` - User not logged in
- Any error with `requiresReauth: true` flag

## Root Causes

1. **Token expired** - User logged in long ago, refresh token no longer valid
2. **Insufficient scopes** - User logged in before new scopes (Drive/Sheets) were added
   - Old token only had Gmail/Calendar scopes
   - New code requires Drive/Sheets scopes for contacts
   - User MUST re-authenticate to grant new scopes
3. **Revoked access** - User manually revoked app permissions in Google Account settings

## Solution

Direct user to OAuth URL: `https://[your-domain]/auth/google`

This will:
1. Start OAuth 2.0 flow with all required scopes
2. Redirect user to Google consent screen
3. Request permissions for Gmail, Calendar, Drive, Sheets, Tasks
4. Return user to app with valid token

## Alfred Integration Checklist

- [ ] Check for `requiresReauth` flag in error response
- [ ] Check for error codes: `GOOGLE_UNAUTHORIZED`, `TOKEN_REFRESH_FAILED`, `AUTH_REQUIRED`
- [ ] **NEVER** ask user to type "Souhlasím" or any consent phrase in chat
- [ ] **ALWAYS** direct user to OAuth URL (`/auth/google`)
- [ ] Explain what happened (permissions expired/missing)
- [ ] Provide clear next steps (click link, log in, come back)

## Implementation Status

✅ **Fixed** - Server now returns proper error codes
✅ **Fixed** - All Google API errors mapped with `requiresReauth` flag
✅ **Fixed** - RPC controllers check for 401/403 and insufficient permissions
✅ **Fixed** - Error messages include clear hints for Alfred

❌ **Not in our control** - Alfred's system prompt/training (ChatGPT/Claude configuration)

## Testing

To test authentication errors:

```bash
# Revoke app access in Google Account
# Visit: https://myaccount.google.com/permissions
# Remove "MCP1 Alfred" from authorized apps

# Try to access contacts
curl -X POST https://[domain]/rpc/contacts \
  -H "Authorization: Bearer [old_token]" \
  -H "Content-Type: application/json" \
  -d '{"op":"list"}'

# Should return:
{
  "ok": false,
  "error": "Authentication required",
  "code": "GOOGLE_UNAUTHORIZED",
  "requiresReauth": true,
  "hint": "User needs to re-authenticate via OAuth..."
}
```

## Summary

**The key fix:** When token lacks Drive/Sheets scopes (common after recent updates), server now properly detects this as `GOOGLE_UNAUTHORIZED` with `requiresReauth: true`, allowing Alfred to direct user to correct OAuth flow instead of asking for meaningless consent in chat.
