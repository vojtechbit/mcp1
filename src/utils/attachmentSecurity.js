/**
 * Attachment Security Utilities
 * 
 * Handles filtering, scanning status, and security for email attachments
 * according to facade requirements.
 */

/**
 * Supported attachment types for preview/processing
 */
export const SUPPORTED_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/html',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel' // xls
]);

/**
 * Types to filter out (inline images, logos, etc.)
 */
export const FILTERED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml'
]);

/**
 * Security warnings to include in responses
 */
export const SECURITY_WARNINGS = [
  "Email provider performs scanning, but does not guarantee file safety. Always verify attachments from unknown senders."
];

/**
 * Check if an attachment should be included in responses
 * 
 * @param {object} attachment - Attachment metadata
 * @returns {boolean} True if should be included
 */
export function shouldIncludeAttachment(attachment) {
  const { mimeType, filename } = attachment;
  
  // Filter out inline images (usually logos, signatures)
  if (FILTERED_TYPES.has(mimeType)) {
    return false;
  }
  
  // Filter out very small files (likely inline images)
  if (attachment.size && attachment.size < 1024) { // < 1KB
    return false;
  }
  
  // Filter out common inline image patterns
  if (filename && /^(image|logo|signature|icon)/i.test(filename)) {
    return false;
  }
  
  return true;
}

/**
 * Determine if an attachment type is supported for preview
 * 
 * @param {string} mimeType - MIME type of attachment
 * @returns {boolean} True if supported
 */
export function isSupported(mimeType) {
  return SUPPORTED_TYPES.has(mimeType);
}

/**
 * Get scan status for an attachment
 * Gmail API doesn't provide virus scan info, so we return 'unknown'
 * and rely on Gmail's backend scanning
 * 
 * @param {object} attachment - Attachment metadata
 * @returns {string} 'clean' | 'unknown' | 'blocked'
 */
export function getScanStatus(attachment) {
  // Gmail scans all attachments, but doesn't expose scan results via API
  // We return 'unknown' and let Gmail handle blocking at their level
  return 'unknown';
}

/**
 * Check if attachment should be blocked
 * 
 * @param {object} attachment - Attachment metadata
 * @returns {boolean} True if should be blocked
 */
export function isBlocked(attachment) {
  const { mimeType, filename } = attachment;
  
  // Block executable files
  const dangerousExtensions = [
    '.exe', '.bat', '.cmd', '.sh', '.ps1',
    '.vbs', '.js', '.jar', '.app', '.dmg',
    '.scr', '.com', '.pif', '.msi'
  ];
  
  if (filename && dangerousExtensions.some(ext => filename.toLowerCase().endsWith(ext))) {
    return true;
  }
  
  // Block dangerous MIME types
  const dangerousMimeTypes = new Set([
    'application/x-msdownload',
    'application/x-msdos-program',
    'application/x-executable',
    'application/x-sh',
    'application/x-bat'
  ]);
  
  if (dangerousMimeTypes.has(mimeType)) {
    return true;
  }
  
  return false;
}

/**
 * Enrich attachment metadata with security information
 * 
 * @param {object} attachment - Raw attachment metadata
 * @param {object} signedUrl - Optional signed URL info
 * @returns {object} Enriched attachment metadata
 * @throws {Error} 451 error if attachment is blocked
 */
export function enrichAttachmentMetadata(attachment, signedUrl = null) {
  const blocked = isBlocked(attachment);
  const supported = isSupported(attachment.mimeType);
  const scanStatus = getScanStatus(attachment);
  
  // Throw 451 error if blocked
  if (blocked) {
    const error = new Error(`Attachment blocked: ${attachment.filename} (security policy)`);
    error.statusCode = 451;
    error.code = 'ATTACHMENT_BLOCKED';
    throw error;
  }
  
  return {
    attachmentId: attachment.body?.attachmentId || attachment.attachmentId,
    name: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.size || 0,
    url: signedUrl?.downloadUrl || null,
    blocked: false,
    scanStatus,
    supported
  };
}

/**
 * Filter and enrich attachments for facade responses
 * 
 * @param {array} attachments - Array of raw attachments
 * @param {function} urlGenerator - Function to generate signed URLs
 * @returns {object} { attachments: array, securityWarnings: array }
 * @throws {Error} 451 error if single attachment is blocked
 */
export function processAttachments(attachments, urlGenerator = null) {
  if (!attachments || attachments.length === 0) {
    return {
      attachments: [],
      securityWarnings: []
    };
  }
  
  const filtered = [];
  const blockedFiles = [];
  
  for (const att of attachments) {
    if (!shouldIncludeAttachment(att)) continue;
    
    try {
      const signedUrl = urlGenerator && !isBlocked(att) 
        ? urlGenerator(att) 
        : null;
      filtered.push(enrichAttachmentMetadata(att, signedUrl));
    } catch (error) {
      if (error.statusCode === 451) {
        blockedFiles.push(att.filename);
        // Re-throw to propagate 451 to controller if only attachment is blocked
        const includedAttachments = attachments.filter(shouldIncludeAttachment);
        if (filtered.length === 0 && includedAttachments.length === 1) {
          // If single attachment is blocked, throw 451
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
  
  const hasAttachments = filtered.length > 0;
  const warnings = hasAttachments ? SECURITY_WARNINGS : [];
  
  if (blockedFiles.length > 0) {
    warnings.push(`${blockedFiles.length} file(s) blocked by security policy: ${blockedFiles.join(', ')}`);
  }
  
  return {
    attachments: filtered,
    securityWarnings: warnings
  };
}
