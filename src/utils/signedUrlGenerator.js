import crypto from 'crypto';

/**
 * Signed URL Generator for Attachment Downloads
 * 
 * Since Gmail API doesn't provide direct download URLs, we create our own
 * signed URLs that expire after a short period (default 15 minutes).
 * 
 * Security:
 * - Uses HMAC-SHA256 signature to prevent tampering
 * - Includes expiration timestamp in the signature
 * - Short expiration time (15 minutes default)
 */

const URL_EXPIRATION_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds

/**
 * Generate a signed URL for attachment download
 * 
 * @param {string} messageId - Gmail message ID
 * @param {string} attachmentId - Gmail attachment ID
 * @param {number} expirationMs - Expiration time in milliseconds (default 15 min)
 * @returns {object} { downloadUrl, expiresAt }
 */
export function generateSignedAttachmentUrl(messageId, attachmentId, expirationMs = URL_EXPIRATION_TIME) {
  const expiresAt = new Date(Date.now() + expirationMs);
  const expiresAtTimestamp = Math.floor(expiresAt.getTime() / 1000); // Unix timestamp in seconds
  
  // Create signature payload
  const payload = `${messageId}:${attachmentId}:${expiresAtTimestamp}`;
  
  // Generate HMAC signature using server secret
  const secret = process.env.ENCRYPTION_KEY || 'fallback-secret-key-for-development';
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url'); // base64url is URL-safe (no +, /, =)
  
  // Construct the signed URL
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const downloadUrl = `${baseUrl}/api/gmail/attachments/${messageId}/${attachmentId}/download?expires=${expiresAtTimestamp}&signature=${signature}`;
  
  return {
    downloadUrl,
    expiresAt: expiresAt.toISOString()
  };
}

/**
 * Verify a signed URL signature
 * 
 * @param {string} messageId - Gmail message ID
 * @param {string} attachmentId - Gmail attachment ID
 * @param {string} expiresAtTimestamp - Unix timestamp in seconds
 * @param {string} providedSignature - Signature from the URL
 * @returns {object} { valid: boolean, error?: string }
 */
export function verifySignedUrl(messageId, attachmentId, expiresAtTimestamp, providedSignature) {
  // Check expiration first
  const now = Math.floor(Date.now() / 1000);
  if (now > parseInt(expiresAtTimestamp)) {
    return {
      valid: false,
      error: 'URL has expired',
      code: 'URL_EXPIRED'
    };
  }
  
  // Regenerate signature
  const payload = `${messageId}:${attachmentId}:${expiresAtTimestamp}`;
  const secret = process.env.ENCRYPTION_KEY || 'fallback-secret-key-for-development';
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  
  // Compare signatures (timing-safe comparison)
  const isValid = crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(providedSignature)
  );
  
  if (!isValid) {
    return {
      valid: false,
      error: 'Invalid signature',
      code: 'INVALID_SIGNATURE'
    };
  }
  
  return { valid: true };
}
