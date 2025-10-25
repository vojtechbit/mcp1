import { google } from 'googleapis';
import { refreshAccessToken } from '../config/oauth.js';
import { getUserByGoogleSub, updateTokens, updateLastUsed } from './databaseService.js';
import { generateSignedAttachmentUrl } from '../utils/signedUrlGenerator.js';
import { isBlocked } from '../utils/attachmentSecurity.js';
import { getPragueOffsetHours } from '../utils/helpers.js';
import { debugStep, wrapModuleFunctions } from '../utils/advancedDebugging.js';
import dotenv from 'dotenv';
// pdf-parse má problém s importem - načteme až když je potřeba
import XLSX from 'xlsx-js-style';

dotenv.config();

// ==================== TOKEN REFRESH MUTEX ====================
const activeRefreshes = new Map();

// ==================== EMAIL SIZE LIMITS ====================
const EMAIL_SIZE_LIMITS = {
  MAX_SIZE_BYTES: 100000,
  MAX_BODY_LENGTH: 8000,
  MAX_HTML_LENGTH: 5000,
  WARNING_SIZE_BYTES: 50000
};

const CONTENT_PREVIEW_LIMIT = 500;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

// ==================== LABEL DIRECTORY CACHE ====================
const LABEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes is enough for interactive sessions
const labelDirectoryCache = new Map();

/**
 * Create authenticated Google API client
 */
async function getAuthenticatedClient(googleSub, forceRefresh = false) {
  const accessToken = await getValidAccessToken(googleSub, forceRefresh);
  
  const { OAuth2 } = google.auth;
  const client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );
  
  client.setCredentials({ access_token: accessToken });
  
  return client;
}

/**
 * Wrapper to handle Google API errors with automatic token refresh on 401
 */
async function handleGoogleApiCall(googleSub, apiCall, retryCount = 0) {
  const MAX_RETRIES = 2;
  
  try {
    return await apiCall();
  } catch (error) {
    const is401 = error.code === 401 || 
                  error.response?.status === 401 || 
                  error.message?.includes('Login Required') || 
                  error.message?.includes('Invalid Credentials') ||
                  error.message?.includes('invalid_grant');
    
    if (is401 && retryCount < MAX_RETRIES) {
      console.log(`⚠️ 401 error detected (attempt ${retryCount + 1}/${MAX_RETRIES + 1}), forcing token refresh...`);
      
      try {
        await getValidAccessToken(googleSub, true);
        await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
        return await handleGoogleApiCall(googleSub, apiCall, retryCount + 1);
      } catch (refreshError) {
        if (refreshError.message?.includes('invalid_grant') || 
            refreshError.message?.includes('Token has been expired')) {
          const authError = new Error('Your session has expired. Please log in again.');
          authError.code = 'REFRESH_TOKEN_INVALID';
          authError.statusCode = 401;
          authError.requiresReauth = true;
          throw authError;
        }
      }
    }
    
    if (is401) {
      const authError = new Error('Authentication required - please log in again');
      authError.code = 'AUTH_REQUIRED';
      authError.statusCode = 401;
      throw authError;
    }
    
    throw error;
  }
}

/**
 * Get valid access token (auto-refresh if expired)
 */
async function getValidAccessToken(googleSub, forceRefresh = false) {
  try {
    debugStep('Resolving valid access token', { googleSub, forceRefresh });
    const user = await getUserByGoogleSub(googleSub);

    if (!user) {
      debugStep('User missing in database', { googleSub });
      throw new Error('User not found in database');
    }

    updateLastUsed(googleSub).catch(err => 
      console.error('Failed to update last_used:', err.message)
    );

    const now = new Date();
    const expiry = new Date(user.tokenExpiry);
    const bufferTime = 5 * 60 * 1000;
    const isExpired = now >= (expiry.getTime() - bufferTime);

    if (forceRefresh || isExpired) {
      debugStep('Access token requires refresh', {
        forceRefresh,
        isExpired,
        expiry: user.tokenExpiry
      });
      if (activeRefreshes.has(googleSub)) {
        await activeRefreshes.get(googleSub);
        const updatedUser = await getUserByGoogleSub(googleSub);
        debugStep('Awaited existing refresh promise', { googleSub });
        return updatedUser.accessToken;
      }

      const refreshPromise = (async () => {
        try {
          debugStep('Refreshing access token with Google', { googleSub });
          const newTokens = await refreshAccessToken(user.refreshToken);
          
          let expiryDate;
          const expiryValue = newTokens.expiry_date || 3600;
          if (expiryValue > 86400) {
            expiryDate = new Date(expiryValue * 1000);
          } else {
            expiryDate = new Date(Date.now() + (expiryValue * 1000));
          }
          
          await updateTokens(googleSub, {
            accessToken: newTokens.access_token,
            refreshToken: newTokens.refresh_token || user.refreshToken,
            expiryDate
          });

          console.log('✅ Access token refreshed successfully');
          debugStep('Stored refreshed tokens', { googleSub, expiryDate });
          return newTokens.access_token;
        } catch (refreshError) {
          debugStep('Refresh token request failed', {
            googleSub,
            error: refreshError.message
          });
          const authError = new Error('Authentication required - please log in again');
          authError.code = 'AUTH_REQUIRED';
          authError.statusCode = 401;
          throw authError;
        } finally {
          debugStep('Released refresh mutex', { googleSub });
          activeRefreshes.delete(googleSub);
        }
      })();

      activeRefreshes.set(googleSub, refreshPromise);
      return await refreshPromise;
    }

    debugStep('Returning cached access token', { googleSub });
    return user.accessToken;
  } catch (error) {
    console.error('❌ [TOKEN_ERROR] Failed to get valid access token:', error.message);
    throw error;
  }
}

// ==================== HELPER FUNCTIONS ====================

function extractPlainText(payload) {
  let text = '';

  if (!payload) return text;

  if (payload.body && payload.body.data) {
    try {
      text = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } catch (e) {
      console.error('Error decoding body:', e.message);
    }
  }
  
  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        try {
          text += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } catch (e) {
          console.error('Error decoding part:', e.message);
        }
      }
      
      if (part.parts) {
        text += extractPlainText(part);
      }
    }
  }

  return text;
}

function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '\n\n[... Text zkrácen kvůli velikosti ...]';
}

function generateGmailLinks(threadId, messageId) {
  if (!threadId) {
    return null;
  }

  const threadLink = `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
  const messageLink = messageId
    ? `${threadLink}?projector=1&messageId=${messageId}`
    : null;

  return {
    thread: threadLink,
    message: messageLink
  };
}

function getHeaderValue(headers = [], name) {
  const lower = name.toLowerCase();
  return headers.find(header => header.name?.toLowerCase() === lower)?.value || '';
}

function formatPragueTimestamps(internalDate) {
  if (!internalDate) {
    return null;
  }

  const timestamp = typeof internalDate === 'string'
    ? parseInt(internalDate, 10)
    : Number(internalDate);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const utcDate = new Date(timestamp);
  const offsetHours = getPragueOffsetHours(utcDate);
  const pragueDate = new Date(utcDate.getTime() + offsetHours * 60 * 60 * 1000);
  const sign = offsetHours >= 0 ? '+' : '-';
  const offset = `${sign}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`;

  return {
    epochMs: timestamp,
    utc: utcDate.toISOString(),
    prague: pragueDate.toISOString().replace('Z', offset),
    offsetHours
  };
}

function extractEmailAddress(value) {
  if (!value) {
    return null;
  }

  const match = value.match(/<([^>]+)>/);
  if (match) {
    return match[1].trim().toLowerCase();
  }

  const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch
    ? emailMatch[0].trim().toLowerCase()
    : value.trim().toLowerCase();
}

function parseAddressList(headerValue) {
  if (!headerValue) {
    return [];
  }

  return headerValue
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const match = part.match(/<([^>]+)>/);
      const address = match
        ? match[1].trim()
        : part.replace(/^["']|["']$/g, '').trim();

      const nameRaw = match
        ? part.replace(match[0], '').trim()
        : '';

      const name = nameRaw ? nameRaw.replace(/^["']|["']$/g, '') : null;

      return {
        address,
        name,
        raw: part,
        normalized: address.toLowerCase()
      };
    });
}

function buildRecipientList(headerValue, userEmailNormalized) {
  return parseAddressList(headerValue).map(entry => ({
    address: entry.address,
    name: entry.name,
    raw: entry.raw,
    isUser: userEmailNormalized ? entry.normalized === userEmailNormalized : false
  }));
}

function collectParticipants(messages, userEmailNormalized) {
  const seen = new Map();

  for (const message of messages) {
    const headers = message.payload?.headers || [];
    const fields = ['From', 'To', 'Cc', 'Bcc'];

    for (const field of fields) {
      const entries = parseAddressList(getHeaderValue(headers, field));
      for (const entry of entries) {
        if (!entry.address) {
          continue;
        }

        const key = entry.normalized;
        if (!seen.has(key)) {
          seen.set(key, {
            address: entry.address,
            name: entry.name,
            raw: entry.raw,
            firstSeenIn: field.toLowerCase(),
            firstMessageId: message.id,
            isUser: userEmailNormalized ? key === userEmailNormalized : false
          });
        }
      }
    }
  }

  return Array.from(seen.values());
}

function findLastInboundMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    const labels = message.labelIds || [];

    if (labels.includes('SENT') || labels.includes('DRAFT')) {
      continue;
    }

    return message;
  }

  return null;
}

function hasFileAttachments(payload) {
  if (!payload) {
    return false;
  }

  const stack = Array.isArray(payload.parts) ? [...payload.parts] : [];

  while (stack.length > 0) {
    const part = stack.pop();
    if (!part) {
      continue;
    }

    if (part.body?.attachmentId && (part.filename || '').trim().length > 0) {
      return true;
    }

    if (Array.isArray(part.parts) && part.parts.length > 0) {
      stack.push(...part.parts);
    }
  }

  return false;
}

function buildContentMetadata(payload) {
  if (!payload) {
    return null;
  }

  const state = {
    plainText: {
      available: false,
      bytes: 0,
      preview: null,
      truncated: false
    },
    html: {
      available: false,
      inline: false,
      viaAttachments: false,
      bytes: 0,
      preview: null,
      truncated: false
    },
    inlineImages: 0,
    inlineAttachments: 0
  };

  function updatePreview(target, text) {
    if (!text) {
      return;
    }

    if (!target.preview) {
      const trimmed = text.length > CONTENT_PREVIEW_LIMIT
        ? text.substring(0, CONTENT_PREVIEW_LIMIT)
        : text;
      target.preview = trimmed;
      target.truncated = text.length > CONTENT_PREVIEW_LIMIT;
    }
  }

  function decodeBody(body) {
    if (!body) return { text: '', bytes: 0 };

    if (body.data) {
      try {
        const buffer = Buffer.from(body.data, 'base64');
        return {
          text: buffer.toString('utf-8'),
          bytes: buffer.length
        };
      } catch (error) {
        console.error('Failed to decode MIME part:', error.message);
        return { text: '', bytes: 0 };
      }
    }

    if (typeof body.size === 'number') {
      return { text: '', bytes: body.size };
    }

    return { text: '', bytes: 0 };
  }

  function processPart(part) {
    if (!part) return;

    const mimeType = part.mimeType || '';
    const lowerMime = mimeType.toLowerCase();

    if (lowerMime.startsWith('multipart/')) {
      (part.parts || []).forEach(processPart);
      return;
    }

    const { text, bytes } = decodeBody(part.body);

    if (lowerMime === 'text/plain') {
      state.plainText.available = true;
      state.plainText.bytes += bytes;
      updatePreview(state.plainText, text);
    } else if (lowerMime === 'text/html') {
      state.html.available = true;
      state.html.bytes += bytes;
      if (part.body?.data) {
        state.html.inline = true;
        updatePreview(state.html, text);
      }
      if (part.body?.attachmentId) {
        state.html.viaAttachments = true;
      }
    } else {
      const headers = part.headers || [];
      const hasContentId = headers.some(h => h.name?.toLowerCase() === 'content-id');
      const disposition = headers.find(h => h.name?.toLowerCase() === 'content-disposition')?.value || '';
      const isInline = hasContentId || disposition.toLowerCase().includes('inline');

      if (isInline) {
        if (lowerMime.startsWith('image/')) {
          state.inlineImages += 1;
        } else {
          state.inlineAttachments += 1;
        }
      }
    }

    if (part.parts) {
      part.parts.forEach(processPart);
    }
  }

  processPart(payload);

  return state;
}

/**
 * FIX: Classify email into inbox category based on Gmail labels
 * @param {object} message - Gmail message object with labelIds
 * @returns {string} Category: primary, work, promotions, social, updates, forums,
 *                   sent, draft, archived, trash, spam, other
 */
function buildReadState(labelIds = []) {
  const labels = Array.isArray(labelIds) ? labelIds : [];
  const normalized = labels.map(label => label.toUpperCase());
  const isUnread = normalized.includes('UNREAD');

  return {
    isUnread,
    isRead: !isUnread
  };
}

function classifyEmailCategory(message) {
  if (!message || !message.labelIds) {
    return 'other';
  }

  const labelIds = message.labelIds || [];
  const labelIdLowercase = labelIds.map(l => l.toLowerCase());

  // Gmail system labels (canonical names)
  const hasLabel = (name) => labelIdLowercase.includes(name.toLowerCase());

  // Sent/Drafts/Trash/Spam should be recognized regardless of Inbox status
  if (hasLabel('TRASH')) {
    return 'trash';
  }

  if (hasLabel('SPAM')) {
    return 'spam';
  }

  if (hasLabel('SENT')) {
    return 'sent';
  }

  if (hasLabel('DRAFT')) {
    return 'draft';
  }

  const inInbox = hasLabel('INBOX');

  // Messages outside of the inbox (but not sent/draft/trash/spam) are archived
  if (!inInbox) {
    return 'archived';
  }

  // Check categories in priority order
  // Note: Gmail category labels are internal - check by label name patterns

  // CATEGORY_PROMOTIONS
  if (hasLabel('CATEGORY_PROMOTIONS')) {
    return 'promotions';
  }
  
  // CATEGORY_SOCIAL
  if (hasLabel('CATEGORY_SOCIAL')) {
    return 'social';
  }
  
  // CATEGORY_UPDATES
  if (hasLabel('CATEGORY_UPDATES')) {
    return 'updates';
  }
  
  // CATEGORY_FORUMS
  if (hasLabel('CATEGORY_FORUMS')) {
    return 'forums';
  }
  
  // CATEGORY_PERSONAL/PRIMARY - these are "important" emails
  // Check both IMPORTANT flag and CATEGORY_PERSONAL
  if (hasLabel('IMPORTANT') || hasLabel('CATEGORY_PERSONAL')) {
    return 'primary';
  }
  
  // Check for work-related patterns (custom user labels containing 'work')
  for (const label of labelIds) {
    if (label.toLowerCase().includes('work')) {
      return 'work';
    }
  }

  // If none matched, return other
  return 'other';
}

/**
 * Extract attachments from email payload
 */
function extractAttachments(payload, messageId) {
  const attachments = [];
  
  if (!payload || !payload.parts) return attachments;
  
  function traverseParts(parts) {
    for (const part of parts) {
      if (part.filename && part.body && part.body.attachmentId) {
        attachments.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size || 0,
          isInline: part.headers?.some(h => 
            h.name.toLowerCase() === 'content-disposition' && 
            h.value.includes('inline')
          ) || false,
          cid: part.headers?.find(h => 
            h.name.toLowerCase() === 'content-id'
          )?.value?.replace(/[<>]/g, '') || null
        });
      }
      
      if (part.parts) {
        traverseParts(part.parts);
      }
    }
  }
  
  traverseParts(payload.parts);
  return attachments;
}

// ==================== GMAIL FUNCTIONS ====================

async function sendEmail(googleSub, { to, subject, body, cc, bcc }) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
    
    const messageParts = [
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      'Content-Transfer-Encoding: 7bit',
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
    ];

    if (cc) messageParts.push(`Cc: ${cc}`);
    if (bcc) messageParts.push(`Bcc: ${bcc}`);
    
    messageParts.push('', body);

    const message = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(message, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage }
    });

    console.log('✅ Email sent:', result.data.id);
    return result.data;
  });
}

/**
 * Read email with optional includeAttachments parameter
 * @param {string|object} options - format string OR options object
 */
async function readEmail(googleSub, messageId, options = {}) {
  return await handleGoogleApiCall(googleSub, async () => {
    // Handle string format parameter for backwards compatibility
    const opts = typeof options === 'string' 
      ? { format: options }
      : (options || {});
    
    const { 
      format = 'full',
      autoTruncate = true,
      includeAttachments = false
    } = opts;

    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const metadataResult = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date']
    });

    const sizeEstimate = metadataResult.data.sizeEstimate || 0;
    const snippet = metadataResult.data.snippet || '';
    
    if (format === 'snippet') {
      return {
        id: messageId,
        snippet: snippet,
        sizeEstimate: sizeEstimate,
        headers: metadataResult.data.payload.headers,
        labelIds: metadataResult.data.labelIds || [],
        readState: buildReadState(metadataResult.data.labelIds),
        format: 'snippet',
        threadId: metadataResult.data.threadId,
        links: generateGmailLinks(metadataResult.data.threadId, messageId)
      };
    }

    if (format === 'metadata') {
      const headers = metadataResult.data.payload.headers;
      const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
      
      let from = fromHeader;
      let fromEmail = fromHeader;
      let fromName = '';
      
      const emailMatch = fromHeader.match(/<(.+)>/);
      if (emailMatch) {
        fromEmail = emailMatch[1];
        fromName = fromHeader.replace(/<.+>/, '').trim().replace(/^["']|["']$/g, '');
      }
      
      // FIX 20.10.2025: Return Prague local time with timezone offset, not UTC
      // Reason: UTC without timezone info (11:02Z) gets displayed wrong by GPT
      // Now: Prague local time (13:02+02:00) so GPT knows the timezone
      const utcDate = new Date(parseInt(metadataResult.data.internalDate));
      const offsetHours = getPragueOffsetHours(utcDate);
      const pragueDate = new Date(utcDate.getTime() + offsetHours * 60 * 60 * 1000);
      const pragueIso = pragueDate.toISOString().replace('Z', `+${String(offsetHours).padStart(2, '0')}:00`);
      
      return {
        ...metadataResult.data,
        from: from,
        fromEmail: fromEmail,
        fromName: fromName,
        subject: subjectHeader,
        date: pragueIso,
        snippet: snippet,
        readState: buildReadState(metadataResult.data.labelIds),
        links: generateGmailLinks(metadataResult.data.threadId, messageId)
      };
    }

    const isTooLarge = sizeEstimate > EMAIL_SIZE_LIMITS.MAX_SIZE_BYTES;

    if (isTooLarge && autoTruncate) {
      const fullResult = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: format === 'minimal' ? 'minimal' : 'full'
      });

      const plainText = extractPlainText(fullResult.data.payload);
      const truncatedText = truncateText(plainText, EMAIL_SIZE_LIMITS.MAX_BODY_LENGTH);

      const response = {
        ...metadataResult.data,
        snippet: snippet,
        bodyPreview: truncatedText,
        truncated: true,
        truncationInfo: {
          originalSize: sizeEstimate,
          maxAllowedSize: EMAIL_SIZE_LIMITS.MAX_SIZE_BYTES,
          truncatedBodyLength: EMAIL_SIZE_LIMITS.MAX_BODY_LENGTH
        },
        readState: buildReadState(metadataResult.data.labelIds),
        links: generateGmailLinks(metadataResult.data.threadId, messageId)
      };

      if (includeAttachments) {
        response.attachments = extractAttachments(fullResult.data.payload, messageId);
      }

      const contentMetadata = buildContentMetadata(fullResult.data.payload);
      if (contentMetadata) {
        response.contentMetadata = contentMetadata;
      }

      return response;
    }

    const result = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: format === 'minimal' ? 'minimal' : 'full'
    });

    const response = {
      ...result.data,
      truncated: false,
      readState: buildReadState(result.data.labelIds),
      links: generateGmailLinks(result.data.threadId, messageId)
    };

    if (includeAttachments) {
      response.attachments = extractAttachments(result.data.payload, messageId);
    }

    const contentMetadata = buildContentMetadata(result.data.payload);
    if (contentMetadata) {
      response.contentMetadata = contentMetadata;
    }

    return response;
  });
}

async function getEmailPreview(googleSub, messageId, options = {}) {
  return await handleGoogleApiCall(googleSub, async () => {
    const { maxBytes = 4096 } = options || {};

    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const result = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    const data = result.data || {};
    const payload = clonePayloadForPreview(data.payload, maxBytes);

    return {
      id: data.id,
      threadId: data.threadId,
      labelIds: data.labelIds || [],
      snippet: data.snippet || '',
      internalDate: data.internalDate,
      payload
    };
  });
}

async function searchEmails(googleSub, { query, q, maxResults = 10, pageToken } = {}) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const finalQuery = typeof query === 'string' && query.trim().length > 0
      ? query.trim()
      : (typeof q === 'string' && q.trim().length > 0 ? q.trim() : undefined);

    const params = {
      userId: 'me',
      q: finalQuery,
      maxResults
    };

    if (pageToken) params.pageToken = pageToken;

    const result = await gmail.users.messages.list(params);
    return result.data;
  });
}

async function listFollowupCandidates(googleSub, options = {}) {
  const dbUser = await getUserByGoogleSub(googleSub).catch(() => null);
  const userEmailNormalized = dbUser?.email?.toLowerCase() || null;

  const {
    minAgeDays = 3,
    maxAgeDays = 14,
    maxThreads = 15,
    includeBodies = true,
    includeDrafts = false,
    query: additionalQuery,
    historyLimit = 5,
    pageToken
  } = options || {};

  const parsedMinAge = Number(minAgeDays);
  const safeMinAge = Number.isFinite(parsedMinAge) && parsedMinAge >= 0
    ? parsedMinAge
    : 3;

  const parsedMaxAge = Number(maxAgeDays);
  let safeMaxAge = Number.isFinite(parsedMaxAge) && parsedMaxAge > 0
    ? parsedMaxAge
    : null;

  if (safeMaxAge !== null && safeMaxAge < safeMinAge) {
    const error = new Error('maxAgeDays must be greater than or equal to minAgeDays');
    error.code = 'INVALID_FOLLOWUP_WINDOW';
    error.statusCode = 400;
    throw error;
  }

  const parsedMaxThreads = Number(maxThreads);
  const safeMaxThreads = Math.min(50, Math.max(1, Number.isFinite(parsedMaxThreads) ? Math.floor(parsedMaxThreads) : 15));

  const parsedHistoryLimit = Number(historyLimit);
  const safeHistoryLimit = Math.min(10, Math.max(1, Number.isFinite(parsedHistoryLimit) ? Math.floor(parsedHistoryLimit) : 5));

  const queryParts = ['in:sent', '-label:drafts', '-label:chats', '-label:spam'];

  if (safeMinAge >= 1) {
    queryParts.push(`older_than:${Math.floor(safeMinAge)}d`);
  }

  if (safeMaxAge !== null) {
    queryParts.push(`newer_than:${Math.ceil(safeMaxAge)}d`);
  }

  if (typeof additionalQuery === 'string' && additionalQuery.trim().length > 0) {
    queryParts.push(additionalQuery.trim());
  }

  const searchQuery = queryParts.join(' ').replace(/\s+/g, ' ').trim();

  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const threads = [];
    const seenThreadIds = new Set();
    const stats = {
      scannedMessages: 0,
      inspectedThreads: 0,
      skipped: {}
    };

    const now = Date.now();
    const minAgeMs = safeMinAge * DAY_IN_MS;
    const maxAgeMs = safeMaxAge !== null ? safeMaxAge * DAY_IN_MS : null;

    let nextPageToken = null;
    const initialPageToken = typeof pageToken === 'string' && pageToken.trim().length > 0
      ? pageToken.trim()
      : undefined;
    let currentPageToken = initialPageToken;

    const maxResultsPerCall = Math.min(100, Math.max(20, safeMaxThreads * 4));

    while (threads.length < safeMaxThreads) {
      const listResult = await gmail.users.messages.list({
        userId: 'me',
        q: searchQuery,
        labelIds: ['SENT'],
        maxResults: maxResultsPerCall,
        pageToken: currentPageToken
      });

      const messageRefs = listResult.data.messages || [];
      stats.scannedMessages += messageRefs.length;

      if (messageRefs.length === 0) {
        nextPageToken = listResult.data.nextPageToken || null;
        break;
      }

      for (const messageRef of messageRefs) {
        if (threads.length >= safeMaxThreads) {
          nextPageToken = listResult.data.nextPageToken || null;
          break;
        }

        if (!messageRef.threadId) {
          stats.skipped.missingThread = (stats.skipped.missingThread || 0) + 1;
          continue;
        }

        if (seenThreadIds.has(messageRef.threadId)) {
          stats.skipped.duplicateThread = (stats.skipped.duplicateThread || 0) + 1;
          continue;
        }

        seenThreadIds.add(messageRef.threadId);

        const threadResult = await gmail.users.threads.get({
          userId: 'me',
          id: messageRef.threadId,
          format: includeBodies ? 'full' : 'metadata'
        });

        const threadMessages = threadResult.data.messages || [];

        if (threadMessages.length === 0) {
          stats.skipped.emptyThread = (stats.skipped.emptyThread || 0) + 1;
          continue;
        }

        stats.inspectedThreads += 1;

        const lastMessage = threadMessages[threadMessages.length - 1];
        const lastInternalDate = parseInt(lastMessage.internalDate, 10);

        if (!Number.isFinite(lastInternalDate)) {
          stats.skipped.missingInternalDate = (stats.skipped.missingInternalDate || 0) + 1;
          continue;
        }

        const ageMs = now - lastInternalDate;

        if (ageMs < minAgeMs) {
          stats.skipped.tooRecent = (stats.skipped.tooRecent || 0) + 1;
          continue;
        }

        if (maxAgeMs !== null && ageMs > maxAgeMs) {
          stats.skipped.tooOld = (stats.skipped.tooOld || 0) + 1;
          continue;
        }

        const lastLabels = lastMessage.labelIds || [];

        if (!lastLabels.includes('SENT')) {
          const fromHeader = getHeaderValue(lastMessage.payload?.headers, 'From');
          const fromAddress = extractEmailAddress(fromHeader);

          if (!fromAddress || (userEmailNormalized && fromAddress !== userEmailNormalized)) {
            stats.skipped.lastNotFromUser = (stats.skipped.lastNotFromUser || 0) + 1;
            continue;
          }
        }

        if (!includeDrafts && lastLabels.includes('DRAFT')) {
          stats.skipped.endsWithDraft = (stats.skipped.endsWithDraft || 0) + 1;
          continue;
        }

        const headers = lastMessage.payload?.headers || [];
        const subject = getHeaderValue(headers, 'Subject') || threadResult.data.snippet || '';
        const toHeader = getHeaderValue(headers, 'To');
        const ccHeader = getHeaderValue(headers, 'Cc');
        const bccHeader = getHeaderValue(headers, 'Bcc');
        const fromHeader = getHeaderValue(headers, 'From');
        const dateHeader = getHeaderValue(headers, 'Date');

        const fromAddressEntry = parseAddressList(fromHeader)[0] || null;
        const senderAddressNormalized = fromAddressEntry?.normalized || extractEmailAddress(fromHeader);

        const lastInboundMessage = findLastInboundMessage(threadMessages);
        const lastInboundTimestamps = lastInboundMessage
          ? formatPragueTimestamps(lastInboundMessage.internalDate)
          : null;
        const lastInboundFrom = lastInboundMessage
          ? getHeaderValue(lastInboundMessage.payload?.headers, 'From')
          : null;

        const timestamps = formatPragueTimestamps(lastInternalDate);
        const waitingDays = timestamps
          ? Number(((now - timestamps.epochMs) / DAY_IN_MS).toFixed(1))
          : null;

        const plainText = includeBodies
          ? truncateText(
              extractPlainText(lastMessage.payload),
              EMAIL_SIZE_LIMITS.MAX_BODY_LENGTH
            )
          : undefined;

        const contentMetadata = includeBodies
          ? buildContentMetadata(lastMessage.payload)
          : undefined;

        const conversation = threadMessages
          .slice(Math.max(0, threadMessages.length - safeHistoryLimit))
          .map(message => {
            const messageHeaders = message.payload?.headers || [];
            const messageTimestamps = formatPragueTimestamps(message.internalDate);
            const labels = message.labelIds || [];
            const direction = labels.includes('SENT')
              ? 'outgoing'
              : (labels.includes('DRAFT') ? 'draft' : 'incoming');

            return {
              id: message.id,
              direction,
              subject: getHeaderValue(messageHeaders, 'Subject') || subject,
              from: getHeaderValue(messageHeaders, 'From') || null,
              to: getHeaderValue(messageHeaders, 'To') || null,
              cc: getHeaderValue(messageHeaders, 'Cc') || null,
              bcc: getHeaderValue(messageHeaders, 'Bcc') || null,
              snippet: message.snippet,
              timestamps: messageTimestamps,
              labelIds: labels,
              hasAttachments: hasFileAttachments(message.payload),
              readState: buildReadState(labels)
            };
          });

        const threadSummary = {
          threadId: threadResult.data.id,
          historyId: threadResult.data.historyId,
          messageCount: threadMessages.length,
          subject,
          snippet: lastMessage.snippet || threadResult.data.snippet || '',
          waitingSince: timestamps,
          waitingDays,
          lastMessageId: lastMessage.id,
          recipients: {
            to: buildRecipientList(toHeader, userEmailNormalized),
            cc: buildRecipientList(ccHeader, userEmailNormalized),
            bcc: buildRecipientList(bccHeader, userEmailNormalized)
          },
          sender: {
            raw: fromHeader || null,
            address: fromAddressEntry?.address || senderAddressNormalized || null,
            name: fromAddressEntry?.name || null,
            isUser: userEmailNormalized
              ? (senderAddressNormalized || '') === userEmailNormalized
              : false
          },
          headers: {
            subject,
            from: fromHeader || null,
            to: toHeader || null,
            cc: ccHeader || null,
            bcc: bccHeader || null,
            date: dateHeader || null
          },
          lastMessage: {
            id: lastMessage.id,
            snippet: lastMessage.snippet,
            timestamps,
            labelIds: lastLabels,
            readState: buildReadState(lastLabels),
            sizeEstimate: lastMessage.sizeEstimate,
            hasAttachments: hasFileAttachments(lastMessage.payload),
            plainText,
            contentMetadata,
            links: generateGmailLinks(threadResult.data.id, lastMessage.id)
          },
          lastInbound: lastInboundMessage
            ? {
                id: lastInboundMessage.id,
                from: lastInboundFrom,
                fromAddress: extractEmailAddress(lastInboundFrom),
                snippet: lastInboundMessage.snippet,
                timestamps: lastInboundTimestamps,
                ageDays: lastInboundTimestamps
                  ? Number(((now - lastInboundTimestamps.epochMs) / DAY_IN_MS).toFixed(1))
                  : null
              }
            : null,
          participants: collectParticipants(threadMessages, userEmailNormalized),
          conversation,
          links: generateGmailLinks(threadResult.data.id, lastMessage.id)
        };

        threads.push(threadSummary);
      }

      if (threads.length >= safeMaxThreads) {
        break;
      }

      if (!listResult.data.nextPageToken) {
        nextPageToken = null;
        break;
      }

      currentPageToken = listResult.data.nextPageToken;
      nextPageToken = currentPageToken;
    }

    const moreAvailable = threads.length >= safeMaxThreads || Boolean(nextPageToken);

    return {
      threads,
      searchQuery,
      generatedAt: new Date().toISOString(),
      filters: {
        minAgeDays: safeMinAge,
        maxAgeDays: safeMaxAge,
        maxThreads: safeMaxThreads,
        includeBodies,
        includeDrafts,
        historyLimit: safeHistoryLimit,
        additionalQuery: typeof additionalQuery === 'string' && additionalQuery.trim().length > 0
          ? additionalQuery.trim()
          : null,
        pageToken: initialPageToken || null
      },
      stats,
      hasMore: moreAvailable,
      nextPageToken: nextPageToken || null
    };
  });
}

function clonePayloadForPreview(payload, maxBytes) {
  if (!payload) return null;

  const seen = new WeakMap();

  function clonePart(part, budget) {
    if (!part) return { cloned: null, remaining: budget };
    if (seen.has(part)) {
      return { cloned: seen.get(part), remaining: budget };
    }

    const cloned = {
      partId: part.partId,
      mimeType: part.mimeType,
      filename: part.filename,
      headers: part.headers
    };

    seen.set(part, cloned);

    let remaining = budget;

    if (part.body) {
      cloned.body = { ...part.body };

      if (typeof part.body.data === 'string' && remaining > 0) {
        const estimatedBytes = Math.ceil((part.body.data.length * 3) / 4);
        if (estimatedBytes > remaining) {
          const allowedChars = Math.max(0, Math.floor((remaining * 4) / 3));
          const truncated = part.body.data.slice(0, allowedChars - (allowedChars % 4 || 0));
          cloned.body.data = truncated;
          remaining = 0;
        } else {
          remaining -= estimatedBytes;
        }
      } else if (typeof part.body.data === 'string') {
        cloned.body.data = part.body.data;
      }
    }

    if (Array.isArray(part.parts)) {
      cloned.parts = [];
      for (const child of part.parts) {
        const { cloned: clonedChild, remaining: newRemaining } = clonePart(child, remaining);
        if (clonedChild) {
          cloned.parts.push(clonedChild);
        }
        remaining = newRemaining;
        if (remaining <= 0) {
          break;
        }
      }
    }

    return { cloned, remaining };
  }

  const { cloned } = clonePart(payload, typeof maxBytes === 'number' && maxBytes > 0 ? maxBytes : Infinity);
  return cloned;
}

async function replyToEmail(googleSub, messageId, { body }) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const original = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Message-ID']
    });

    const headers = original.data.payload.headers;
    const originalFrom = headers.find(h => h.name === 'From')?.value;
    const originalSubject = headers.find(h => h.name === 'Subject')?.value;
    const originalMessageId = headers.find(h => h.name === 'Message-ID')?.value;

    const replySubject = originalSubject?.replace(/^Re: /, '') || '';
    const encodedSubject = `=?UTF-8?B?${Buffer.from(`Re: ${replySubject}`, 'utf8').toString('base64')}?=`;

    const messageParts = [
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      'Content-Transfer-Encoding: 7bit',
      `To: ${originalFrom}`,
      `Subject: ${encodedSubject}`,
      `In-Reply-To: ${originalMessageId}`,
      `References: ${originalMessageId}`,
      '',
      body
    ];

    const message = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(message, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: original.data.threadId
      }
    });

    return result.data;
  });
}

async function createDraft(googleSub, { to, subject, body }) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;

    const messageParts = [
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      'Content-Transfer-Encoding: 7bit',
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      '',
      body
    ];

    const message = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(message, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const result = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw: encodedMessage }
      }
    });

    // ✅ VALIDACE draft response
    if (!result.data) {
      console.error('❌ [DRAFT_ERROR] Gmail API vrátila prázdný response');
      throw new Error('Draft creation failed - empty response from Gmail API');
    }

    if (!result.data.id) {
      console.error('🔴 [DRAFT_ERROR] Draft ID chybí v odpovědi!');
      console.error('Full response:', JSON.stringify(result.data, null, 2));
      throw new Error('Draft creation failed - missing draft ID in response');
    }

    if (typeof result.data.id !== 'string') {
      console.error('⚠️ [DRAFT_ERROR] Draft ID má nesprávný typ:', typeof result.data.id);
      throw new Error('Draft creation failed - draft ID is not a string');
    }

    // 🔍 DEBUG: Inspekce kompletního response
    console.log(`✅ Draft created successfully`);
    console.log('[DRAFT_RESPONSE_DEBUG]', {
      hasId: !!result.data.id,
      id: result.data.id,
      idType: typeof result.data.id,
      hasMessage: !!result.data.message,
      messageId: result.data.message?.id,
      messageIdType: typeof result.data.message?.id,
      allKeys: Object.keys(result.data)
    });
    console.log(`✅ Using draft.id: ${result.data.id}`);
    return result.data;
  });
}

/**
 * Send an existing draft by ID
 */
async function sendDraft(googleSub, draftId) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const result = await gmail.users.drafts.send({
      userId: 'me',
      id: draftId
    });

    console.log('✅ Draft sent:', draftId);
    return result.data;
  });
}

async function deleteEmail(googleSub, messageId) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    await gmail.users.messages.trash({
      userId: 'me',
      id: messageId
    });

    return { success: true, messageId };
  });
}

async function toggleStar(googleSub, messageId, star = true) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: star ? ['STARRED'] : [],
        removeLabelIds: star ? [] : ['STARRED']
      }
    });

    return { success: true, messageId, starred: star };
  });
}

async function markAsRead(googleSub, messageId, read = true) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: read ? [] : ['UNREAD'],
        removeLabelIds: read ? ['UNREAD'] : []
      }
    });

    return { success: true, messageId, read };
  });
}

// ==================== NEW: LABELS ====================

const LABEL_ALIAS_TOKENS = {
  INBOX: ['inbox', 'primary'],
  CATEGORY_PERSONAL: ['primary', 'personal', 'work'],
  CATEGORY_PROMOTIONS: ['promotions', 'promo', 'nabidky'],
  CATEGORY_SOCIAL: ['social', 'socialni'],
  CATEGORY_UPDATES: ['updates', 'aktualizace'],
  CATEGORY_FORUMS: ['forums', 'diskuze'],
  IMPORTANT: ['important', 'dulezite'],
  STARRED: ['starred', 'hvezdicka'],
  SENT: ['sent', 'odeslane'],
  DRAFT: ['draft', 'drafts', 'koncept'],
  TRASH: ['trash', 'kose', 'smazane'],
  SPAM: ['spam', 'nevyzadane'],
  CATEGORY_FINANCE: ['finance'],
  CATEGORY_RECEIPTS: ['receipts', 'potvrzeni'],
  CATEGORY_TRAVEL: ['travel', 'cestovani'],
  CATEGORY_PURCHASES: ['purchases', 'nakupy']
};

function normalizeLabelCandidate(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      raw: value ?? '',
      tokens: [],
      ordered: '',
      sorted: '',
      collapsed: ''
    };
  }

  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const tokens = normalized
    .split(/[^a-z0-9]+/u)
    .map(token => token.trim())
    .filter(Boolean);

  const ordered = tokens.join(' ');
  const sorted = [...tokens].sort().join(' ');
  const collapsed = tokens.join('');

  return { raw: value, tokens, ordered, sorted, collapsed };
}

function computeLabelMeta(label) {
  const baseMeta = normalizeLabelCandidate(label.name || '');
  const idMeta = normalizeLabelCandidate(label.id || '');
  const aliasMetas = (LABEL_ALIAS_TOKENS[label.id] || []).map(token => normalizeLabelCandidate(token));

  const tokenSet = new Set([
    ...baseMeta.tokens,
    ...idMeta.tokens,
    ...aliasMetas.flatMap(meta => meta.tokens)
  ]);

  const aliasLookup = new Set([
    ...aliasMetas.map(meta => meta.ordered),
    ...aliasMetas.map(meta => meta.sorted),
    ...aliasMetas.map(meta => meta.collapsed)
  ].filter(Boolean));

  return {
    baseMeta,
    idMeta,
    tokenSet,
    aliasLookup
  };
}

function getLabelMeta(label) {
  if (!label) return null;
  if (!label.__matchMeta) {
    Object.defineProperty(label, '__matchMeta', {
      value: computeLabelMeta(label),
      enumerable: false,
      writable: false,
      configurable: false
    });
  }
  return label.__matchMeta;
}

function computeTokenOverlap(tokens, tokenSet) {
  if (!tokens.length || !tokenSet || tokenSet.size === 0) {
    return 0;
  }

  let overlap = 0;
  const seen = new Set();
  for (const token of tokens) {
    if (!seen.has(token) && tokenSet.has(token)) {
      overlap++;
      seen.add(token);
    }
  }
  return overlap;
}

function matchLabelCandidates(labels, rawInput) {
  const input = typeof rawInput === 'string' ? rawInput.trim() : '';
  if (!input) return [];

  const inputMeta = normalizeLabelCandidate(input);
  if (inputMeta.tokens.length === 0) {
    return [];
  }

  const matches = [];

  for (const label of labels) {
    const meta = getLabelMeta(label);
    if (!meta) continue;

    let confidence = 0;
    let reason = 'noOverlap';

    if (label.id && label.id.toLowerCase() === input.toLowerCase()) {
      confidence = 1;
      reason = 'idExact';
    } else if (meta.baseMeta.ordered && meta.baseMeta.ordered === inputMeta.ordered) {
      confidence = 0.97;
      reason = 'orderedExact';
    } else if (meta.baseMeta.sorted && meta.baseMeta.sorted === inputMeta.sorted) {
      confidence = 0.94;
      reason = 'tokenExact';
    } else if (meta.aliasLookup.has(inputMeta.ordered) ||
               meta.aliasLookup.has(inputMeta.sorted) ||
               meta.aliasLookup.has(inputMeta.collapsed)) {
      confidence = 0.95;
      reason = 'alias';
    } else {
      const overlap = computeTokenOverlap(inputMeta.tokens, meta.tokenSet);
      const inputCoverage = overlap / inputMeta.tokens.length;
      const labelCoverage = meta.tokenSet.size ? overlap / meta.tokenSet.size : 0;

      if (inputCoverage === 1 && labelCoverage >= 0.5) {
        confidence = 0.88;
        reason = 'inputSubset';
      } else if (inputCoverage >= 0.66 && labelCoverage >= 0.5) {
        confidence = 0.78;
        reason = 'strongOverlap';
      } else if (inputCoverage >= 0.5) {
        confidence = 0.65;
        reason = 'partialOverlap';
      } else if (meta.baseMeta.ordered && meta.baseMeta.ordered.includes(inputMeta.ordered) && inputMeta.ordered) {
        confidence = 0.62;
        reason = 'orderedSubstring';
      } else if (inputMeta.tokens.length === 1) {
        const token = inputMeta.tokens[0];
        const hasPrefix = Array.from(meta.tokenSet).some(labelToken =>
          labelToken.startsWith(token) || token.startsWith(labelToken)
        );
        if (hasPrefix) {
          confidence = 0.58;
          reason = 'prefixOverlap';
        }
      }
    }

    if (confidence > 0) {
      matches.push({
        label,
        confidence,
        reason
      });
    }
  }

  matches.sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return (a.label.name || '').localeCompare(b.label.name || '', 'cs', { sensitivity: 'base' });
  });

  return matches;
}

async function fetchLabelDirectory(googleSub) {
  const authClient = await getAuthenticatedClient(googleSub);
  const gmail = google.gmail({ version: 'v1', auth: authClient });

  const result = await gmail.users.labels.list({
    userId: 'me'
  });

  const labels = (result.data.labels || []).map(label => ({
    id: label.id,
    name: label.name,
    type: label.type === 'system' ? 'system' : 'user',
    color: label.color?.backgroundColor || null
  }));

  labels.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'cs', { sensitivity: 'base' }));
  return labels;
}

async function getLabelDirectory(googleSub, { forceRefresh = false } = {}) {
  const cacheKey = googleSub || '__anon__';
  const cached = labelDirectoryCache.get(cacheKey);
  const now = Date.now();

  if (!forceRefresh && cached && (now - cached.timestamp) < LABEL_CACHE_TTL_MS) {
    return cached.labels;
  }

  const labels = await handleGoogleApiCall(googleSub, () => fetchLabelDirectory(googleSub));
  labelDirectoryCache.set(cacheKey, { labels, timestamp: now });
  console.log('✅ Labels listed:', labels.length, forceRefresh ? '(forced refresh)' : '');
  return labels;
}

async function resolveLabelIdentifiers(googleSub, requestedIdentifiers, options = {}) {
  const inputsArray = Array.isArray(requestedIdentifiers)
    ? requestedIdentifiers
    : [requestedIdentifiers];

  const normalizedInputs = inputsArray
    .map(value => typeof value === 'string' ? value.trim() : '')
    .filter(value => value.length > 0);

  if (normalizedInputs.length === 0) {
    return {
      resolved: [],
      ambiguous: [],
      unmatched: [],
      requiresConfirmation: false,
      appliedLabels: [],
      appliedLabelIds: [],
      requested: []
    };
  }

  const labels = options.labels || await getLabelDirectory(googleSub, {
    forceRefresh: options.forceRefresh === true
  });

  const resolved = [];
  const ambiguous = [];
  const unmatched = [];
  const seenInputs = new Set();

  for (const input of normalizedInputs) {
    const lowerInput = input.toLowerCase();
    if (seenInputs.has(lowerInput)) {
      continue;
    }
    seenInputs.add(lowerInput);

    const direct = labels.find(label => label.id?.toLowerCase() === lowerInput);
    if (direct) {
      resolved.push({
        input,
        label: direct,
        confidence: 1,
        reason: 'idExact'
      });
      continue;
    }

    const matches = matchLabelCandidates(labels, input);
    if (matches.length === 0) {
      unmatched.push({ input, suggestions: [] });
      continue;
    }

    const best = matches[0];
    const topConfidence = best.confidence;
    const strongReason = ['idExact', 'orderedExact', 'tokenExact', 'alias'].includes(best.reason);
    const closeMatches = matches.filter(match =>
      match.confidence >= 0.6 && (topConfidence - match.confidence) <= 0.1
    );

    if ((strongReason || topConfidence >= 0.86) && closeMatches.length === 1) {
      resolved.push({
        input,
        label: best.label,
        confidence: best.confidence,
        reason: best.reason
      });
      continue;
    }

    if (topConfidence < 0.55) {
      unmatched.push({
        input,
        suggestions: matches.slice(0, 5)
      });
      continue;
    }

    ambiguous.push({
      input,
      options: matches.slice(0, 5)
    });
  }

  return {
    resolved,
    ambiguous,
    unmatched,
    requiresConfirmation: ambiguous.length > 0 || unmatched.length > 0,
    appliedLabels: resolved.map(entry => entry.label),
    appliedLabelIds: resolved.map(entry => entry.label.id),
    requested: normalizedInputs
  };
}

/**
 * List all Gmail labels
 */
async function listLabels(googleSub, options = {}) {
  const includeMatchesFor = options.includeMatchesFor;
  const forceRefresh = options.forceRefresh === true;

  const labels = await getLabelDirectory(googleSub, { forceRefresh });

  if (typeof includeMatchesFor === 'undefined') {
    return labels;
  }

  const resolution = await resolveLabelIdentifiers(googleSub, includeMatchesFor, {
    labels
  });

  return {
    labels,
    resolution
  };
}

/**
 * Modify labels on a message
 */
async function modifyMessageLabels(googleSub, messageId, { add = [], remove = [] }) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: add,
        removeLabelIds: remove
      }
    });

    console.log(`✅ Labels modified on message ${messageId}`);
    return { success: true };
  });
}

/**
 * Modify labels on all messages in a thread
 */
async function modifyThreadLabels(googleSub, threadId, { add = [], remove = [] }) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    await gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: {
        addLabelIds: add,
        removeLabelIds: remove
      }
    });

    console.log(`✅ Labels modified on thread ${threadId}`);
    return { success: true };
  });
}

// ==================== NEW: THREADS ====================

/**
 * Get thread summary
 */
async function getThread(googleSub, threadId) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const result = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date']
    });

    const messages = result.data.messages || [];
    const lastMessage = messages[messages.length - 1];
    const lastHeaders = lastMessage?.payload?.headers || [];
    
    // Extract participants
    const participantsSet = new Set();
    for (const msg of messages) {
      const fromHeader = msg.payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value;
      if (fromHeader) {
        const emailMatch = fromHeader.match(/<(.+)>/) || fromHeader.match(/([^\s]+@[^\s]+)/);
        if (emailMatch) {
          participantsSet.add(emailMatch[1] || emailMatch[0]);
        }
      }
    }

    const lastFrom = lastHeaders.find(h => h.name.toLowerCase() === 'from')?.value || '';
    const lastSubject = lastHeaders.find(h => h.name.toLowerCase() === 'subject')?.value || '';
    
    let lastFromEmail = lastFrom;
    let lastFromName = '';
    const emailMatch = lastFrom.match(/<(.+)>/);
    if (emailMatch) {
      lastFromEmail = emailMatch[1];
      lastFromName = lastFrom.replace(/<.+>/, '').trim().replace(/^["']|["']$/g, '');
    }

    const isUnread = messages.some(msg => msg.labelIds?.includes('UNREAD'));
    const allLabelIds = new Set();
    messages.forEach(msg => {
      (msg.labelIds || []).forEach(id => allLabelIds.add(id));
    });

    return {
      threadId: threadId,
      count: messages.length,
      unread: isUnread,
      participants: Array.from(participantsSet).map(email => ({
        email,
        name: null
      })),
      messageIds: messages.map(m => m.id),
      labelIds: Array.from(allLabelIds),
      last: {
        id: lastMessage.id,
        from: {
          name: lastFromName || null,
          email: lastFromEmail
        },
        subject: lastSubject,
        date: new Date(parseInt(lastMessage.internalDate)).toISOString(),
        snippet: lastMessage.snippet
      }
    };
  });
}

/**
 * Mark thread as read/unread
 */
async function setThreadRead(googleSub, threadId, read = true) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    await gmail.users.threads.modify({
      userId: 'me',
      id: threadId,
      requestBody: {
        addLabelIds: read ? [] : ['UNREAD'],
        removeLabelIds: read ? ['UNREAD'] : []
      }
    });

    console.log(`✅ Thread marked as ${read ? 'read' : 'unread'}:`, threadId);
    return { success: true };
  });
}

/**
 * Reply to a thread
 */
async function replyToThread(googleSub, threadId, { body }) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // Get thread to find last message
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Message-ID']
    });

    const messages = thread.data.messages || [];
    const lastMessage = messages[messages.length - 1];
    const headers = lastMessage?.payload?.headers || [];
    
    const originalFrom = headers.find(h => h.name === 'From')?.value;
    const originalSubject = headers.find(h => h.name === 'Subject')?.value;
    const originalMessageId = headers.find(h => h.name === 'Message-ID')?.value;

    const replySubject = originalSubject?.replace(/^Re: /, '') || '';
    const encodedSubject = `=?UTF-8?B?${Buffer.from(`Re: ${replySubject}`, 'utf8').toString('base64')}?=`;

    const messageParts = [
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      'Content-Transfer-Encoding: 7bit',
      `To: ${originalFrom}`,
      `Subject: ${encodedSubject}`,
      `In-Reply-To: ${originalMessageId}`,
      `References: ${originalMessageId}`,
      '',
      body
    ];

    const message = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(message, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: threadId
      }
    });

    console.log('✅ Reply sent to thread:', threadId);
    return result.data;
  });
}

// ==================== NEW: ATTACHMENTS ====================

/**
 * Get attachment metadata with download URL
 */
async function getAttachmentMeta(googleSub, messageId, attachmentId) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // Get message to find attachment details
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    let attachmentMeta = null;
    
    function findAttachment(parts) {
      for (const part of parts) {
        if (part.body?.attachmentId === attachmentId) {
          attachmentMeta = {
            attachmentId: attachmentId,
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size || 0,
            isInline: part.headers?.some(h => 
              h.name.toLowerCase() === 'content-disposition' && 
              h.value.includes('inline')
            ) || false,
            cid: part.headers?.find(h => 
              h.name.toLowerCase() === 'content-id'
            )?.value?.replace(/[<>]/g, '') || null
          };
          return true;
        }
        if (part.parts) {
          if (findAttachment(part.parts)) return true;
        }
      }
      return false;
    }

    if (message.data.payload?.parts) {
      findAttachment(message.data.payload.parts);
    }

    if (!attachmentMeta) {
      throw new Error('Attachment not found');
    }

    // Check if attachment is blocked by security policy
    if (isBlocked(attachmentMeta)) {
      const error = new Error(`Attachment blocked: ${attachmentMeta.filename} (security policy)`);
      error.statusCode = 451;
      error.code = 'ATTACHMENT_BLOCKED';
      throw error;
    }

    // Generate signed URL with 1-hour expiration
    const { downloadUrl, expiresAt } = generateSignedAttachmentUrl(
      messageId,
      attachmentId
    );
    
    attachmentMeta.downloadUrl = downloadUrl;
    attachmentMeta.expiresAt = expiresAt;

    return attachmentMeta;
  });
}

/**
 * Preview attachment text (PDF, TXT, HTML) - FULL IMPLEMENTATION
 */
async function previewAttachmentText(googleSub, messageId, attachmentId, maxKb = 256) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // Get message to find attachment MIME type
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    let mimeType = 'application/octet-stream';
    
    function findMimeType(parts) {
      for (const part of parts) {
        if (part.body?.attachmentId === attachmentId) {
          mimeType = part.mimeType || mimeType;
          return true;
        }
        if (part.parts) {
          if (findMimeType(part.parts)) return true;
        }
      }
      return false;
    }

    if (message.data.payload?.parts) {
      findMimeType(message.data.payload.parts);
    }

    // Get attachment data
    const attachment = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: attachmentId
    });

    const data = Buffer.from(attachment.data.data, 'base64url');
    const sizeKb = data.length / 1024;
    
    if (sizeKb > maxKb * 2) {
      return {
        success: false,
        error: 'Attachment too large for preview',
        sizeKb: Math.round(sizeKb),
        maxKb: maxKb
      };
    }

    let text = '';
    let contentType = 'text/plain';

    try {
      // Handle PDF files
      if (mimeType === 'application/pdf') {
        // Dynamicky importuj pdf-parse až když je potřeba
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(data);
        text = pdfData.text;
        contentType = 'application/pdf';
      }
      // Handle plain text
      else if (mimeType.includes('text/plain')) {
        text = data.toString('utf-8');
        contentType = 'text/plain';
      }
      // Handle HTML
      else if (mimeType.includes('text/html')) {
        text = data.toString('utf-8');
        contentType = 'text/html';
      }
      // Fallback
      else {
        text = data.toString('utf-8', 0, Math.min(data.length, maxKb * 1024));
        contentType = mimeType;
      }

      // Truncate if needed
      const maxChars = maxKb * 1024;
      const truncated = text.length > maxChars;
      if (truncated) {
        text = text.substring(0, maxChars);
      }

      return {
        success: true,
        truncated: truncated,
        chars: text.length,
        bytesScanned: data.length,
        contentType: contentType,
        text: text
      };

    } catch (error) {
      console.error('Error extracting text:', error.message);
      
      // Fallback to raw text
      text = data.toString('utf-8', 0, Math.min(data.length, maxKb * 1024));
      
      return {
        success: true,
        truncated: true,
        chars: text.length,
        bytesScanned: Math.min(data.length, maxKb * 1024),
        contentType: 'text/plain',
        text: text,
        warning: 'Could not parse as PDF, showing raw text'
      };
    }
  });
}

/**
 * Preview attachment table (CSV, XLSX) - FULL IMPLEMENTATION
 */
async function previewAttachmentTable(googleSub, messageId, attachmentId, options = {}) {
  return await handleGoogleApiCall(googleSub, async () => {
    const { sheet = 0, maxRows = 50 } = options;
    
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // Get message to find attachment MIME type and filename
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    let mimeType = 'application/octet-stream';
    let filename = 'unknown';
    
    function findAttachmentInfo(parts) {
      for (const part of parts) {
        if (part.body?.attachmentId === attachmentId) {
          mimeType = part.mimeType || mimeType;
          filename = part.filename || filename;
          return true;
        }
        if (part.parts) {
          if (findAttachmentInfo(part.parts)) return true;
        }
      }
      return false;
    }

    if (message.data.payload?.parts) {
      findAttachmentInfo(message.data.payload.parts);
    }

    // Get attachment data
    const attachment = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: attachmentId
    });

    const data = Buffer.from(attachment.data.data, 'base64url');

    try {
      // Handle CSV files
      if (mimeType.includes('csv') || filename.toLowerCase().endsWith('.csv')) {
        const text = data.toString('utf-8');
        const lines = text.split('\n').filter(l => l.trim());
        
        if (lines.length === 0) {
          return {
            success: false,
            error: 'CSV file is empty'
          };
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        const rows = lines.slice(1, Math.min(lines.length, maxRows + 1))
          .map(line => {
            // Simple CSV parsing (handles basic cases)
            return line.split(',').map(cell => cell.trim().replace(/^["']|["']$/g, ''));
          });
        
        return {
          success: true,
          truncated: lines.length > maxRows + 1,
          totalRows: lines.length - 1,
          totalCols: headers.length,
          headers: headers,
          rows: rows
        };
      }
      
      // Handle XLSX files
      else if (mimeType.includes('spreadsheet') || 
               mimeType.includes('excel') ||
               filename.toLowerCase().endsWith('.xlsx') ||
               filename.toLowerCase().endsWith('.xls')) {
        
        const workbook = XLSX.read(data, { type: 'buffer' });
        
        // Get sheet names
        const sheetNames = workbook.SheetNames;
        
        if (sheetNames.length === 0) {
          return {
            success: false,
            error: 'Excel file has no sheets'
          };
        }

        // Determine which sheet to read
        let sheetName;
        if (typeof sheet === 'string') {
          sheetName = sheet;
          if (!sheetNames.includes(sheetName)) {
            return {
              success: false,
              error: `Sheet "${sheetName}" not found`,
              sheets: sheetNames
            };
          }
        } else {
          const sheetIndex = parseInt(sheet);
          if (sheetIndex >= sheetNames.length) {
            return {
              success: false,
              error: `Sheet index ${sheetIndex} out of range`,
              sheets: sheetNames
            };
          }
          sheetName = sheetNames[sheetIndex];
        }

        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON array
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,  // Return array of arrays
          defval: null,  // Use null for empty cells
          blankrows: false  // Skip blank rows
        });

        if (jsonData.length === 0) {
          return {
            success: false,
            error: 'Sheet is empty',
            sheetName: sheetName,
            sheets: sheetNames
          };
        }

        const headers = jsonData[0].map(h => h !== null ? String(h) : '');
        const rows = jsonData.slice(1, Math.min(jsonData.length, maxRows + 1));
        
        return {
          success: true,
          truncated: jsonData.length > maxRows + 1,
          sheetName: sheetName,
          sheets: sheetNames,
          totalRows: jsonData.length - 1,
          totalCols: headers.length,
          headers: headers,
          rows: rows
        };
      }
      
      // Unsupported type
      else {
        return {
          success: false,
          error: 'Unsupported file type for table preview',
          mimeType: mimeType,
          filename: filename,
          hint: 'Only CSV and XLSX files are supported'
        };
      }

    } catch (error) {
      console.error('Error parsing table:', error.message);
      
      return {
        success: false,
        error: 'Failed to parse file',
        details: error.message,
        mimeType: mimeType,
        filename: filename
      };
    }
  });
}

// ==================== CALENDAR FUNCTIONS ====================

async function createCalendarEvent(googleSub, eventData, options = {}) {
  const {
    calendarId = 'primary',
    conferenceDataVersion
  } = options;

  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const event = {
      summary: eventData.summary,
      description: eventData.description || '',
      start: eventData.start,
      end: eventData.end
    };

    if (eventData.attendees) {
      event.attendees = eventData.attendees.map(attendee => {
        if (typeof attendee === 'string') {
          return { email: attendee };
        } else if (attendee && attendee.email) {
          const obj = { email: attendee.email };
          if (attendee.displayName) obj.displayName = attendee.displayName;
          return obj;
        }
        return null;
      }).filter(Boolean);
    }

    if (eventData.location) {
      event.location = eventData.location;
    }

    if (eventData.reminders) {
      event.reminders = eventData.reminders;
    }

    const insertConfig = {
      calendarId,
      requestBody: event,
      sendUpdates: eventData.attendees ? 'all' : 'none'
    };

    if (typeof conferenceDataVersion === 'number') {
      insertConfig.conferenceDataVersion = conferenceDataVersion;
    } else if (eventData.conferenceData) {
      insertConfig.conferenceDataVersion = 1;
    }

    const result = await calendar.events.insert(insertConfig);

    return result.data;
  });
}

async function getCalendarEvent(googleSub, eventId, options = {}) {
  const { calendarId = 'primary' } = options;

  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const result = await calendar.events.get({
      calendarId,
      eventId: eventId
    });

    return result.data;
  });
}

async function listCalendarEvents(googleSub, {
  calendarId = 'primary',
  timeMin,
  timeMax,
  maxResults = 10,
  query
} = {}) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const params = {
      calendarId,
      timeMin: timeMin || new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime'
    };

    if (timeMax) params.timeMax = timeMax;
    if (query) params.q = query;

    const result = await calendar.events.list(params);
    return result.data;
  });
}

async function updateCalendarEvent(googleSub, eventId, updates, options = {}) {
  const { calendarId = 'primary' } = options;

  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const existing = await calendar.events.get({
      calendarId,
      eventId: eventId
    });

    const updatedEvent = {
      ...existing.data,
      ...updates
    };

    // Transform attendees if provided
    if (updatedEvent.attendees) {
      updatedEvent.attendees = updatedEvent.attendees.map(attendee => {
        if (typeof attendee === 'string') {
          return { email: attendee };
        } else if (attendee && attendee.email) {
          const obj = { email: attendee.email };
          if (attendee.displayName) obj.displayName = attendee.displayName;
          return obj;
        }
        return null;
      }).filter(Boolean);
    }

    const result = await calendar.events.update({
      calendarId,
      eventId: eventId,
      requestBody: updatedEvent,
      sendUpdates: updatedEvent.attendees ? 'all' : 'none'
    });

    return result.data;
  });
}

async function deleteCalendarEvent(googleSub, eventId, options = {}) {
  const { calendarId = 'primary' } = options;

  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    await calendar.events.delete({
      calendarId,
      eventId: eventId
    });

    return { success: true, eventId };
  });
}

async function checkConflicts(googleSub, { calendarId = 'primary', start, end, excludeEventId }) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const result = await calendar.events.list({
      calendarId,
      timeMin: start,
      timeMax: end,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = result.data.items || [];
    const conflicts = [];
    const requestStart = new Date(start);
    const requestEnd = new Date(end);

    for (const event of events) {
      if (excludeEventId && event.id === excludeEventId) {
        continue;
      }

      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);

      if (eventStart < requestEnd && eventEnd > requestStart) {
        conflicts.push({
          eventId: event.id,
          summary: event.summary,
          start: event.start.dateTime || event.start.date,
          end: event.end.dateTime || event.end.date,
          htmlLink: event.htmlLink
        });
      }
    }

    return conflicts;
  });
}

async function listCalendars(googleSub) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const result = await calendar.calendarList.list();
    const items = result.data.items || [];

    return items.map(item => ({
      id: item.id,
      displayName: item.summary,
      isPrimary: item.primary === true,
      accessRole: item.accessRole
    }));
  });
}

/**
 * Download attachment (for signed URL endpoint)
 */
async function downloadAttachment(googleSub, messageId, attachmentId) {
  return await handleGoogleApiCall(googleSub, async () => {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // Get message to find attachment info
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    let attachmentInfo = null;
    
    function findAttachment(parts) {
      for (const part of parts) {
        if (part.body?.attachmentId === attachmentId) {
          attachmentInfo = {
            filename: part.filename || 'attachment',
            mimeType: part.mimeType || 'application/octet-stream',
            size: part.body.size || 0
          };
          return true;
        }
        if (part.parts) {
          if (findAttachment(part.parts)) return true;
        }
      }
      return false;
    }

    if (message.data.payload?.parts) {
      findAttachment(message.data.payload.parts);
    }

    if (!attachmentInfo) {
      const error = new Error('Attachment not found');
      error.statusCode = 404;
      throw error;
    }

    // Get attachment data
    const attachment = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: messageId,
      id: attachmentId
    });

    const data = Buffer.from(attachment.data.data, 'base64url');

    return {
      filename: attachmentInfo.filename,
      mimeType: attachmentInfo.mimeType,
      size: attachmentInfo.size,
      data: data
    };
  });
}

const traced = wrapModuleFunctions('services.googleApiService', {
  EMAIL_SIZE_LIMITS,
  getValidAccessToken,
  sendEmail,
  readEmail,
  getEmailPreview,
  searchEmails,
  listFollowupCandidates,
  replyToEmail,
  createDraft,
  sendDraft,
  deleteEmail,
  toggleStar,
  markAsRead,
  listLabels,
  resolveLabelIdentifiers,
  modifyMessageLabels,
  modifyThreadLabels,
  getThread,
  setThreadRead,
  replyToThread,
  getAttachmentMeta,
  previewAttachmentText,
  previewAttachmentTable,
  downloadAttachment,
  classifyEmailCategory,
  createCalendarEvent,
  getCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEvent,
  checkConflicts,
  listCalendars
});

const {
  EMAIL_SIZE_LIMITS: tracedEMAIL_SIZE_LIMITS,
  getValidAccessToken: tracedGetValidAccessToken,
  sendEmail: tracedSendEmail,
  readEmail: tracedReadEmail,
  getEmailPreview: tracedGetEmailPreview,
  searchEmails: tracedSearchEmails,
  listFollowupCandidates: tracedListFollowupCandidates,
  replyToEmail: tracedReplyToEmail,
  createDraft: tracedCreateDraft,
  sendDraft: tracedSendDraft,
  deleteEmail: tracedDeleteEmail,
  toggleStar: tracedToggleStar,
  markAsRead: tracedMarkAsRead,
  listLabels: tracedListLabels,
  resolveLabelIdentifiers: tracedResolveLabelIdentifiers,
  modifyMessageLabels: tracedModifyMessageLabels,
  modifyThreadLabels: tracedModifyThreadLabels,
  getThread: tracedGetThread,
  setThreadRead: tracedSetThreadRead,
  replyToThread: tracedReplyToThread,
  getAttachmentMeta: tracedGetAttachmentMeta,
  previewAttachmentText: tracedPreviewAttachmentText,
  previewAttachmentTable: tracedPreviewAttachmentTable,
  downloadAttachment: tracedDownloadAttachment,
  classifyEmailCategory: tracedClassifyEmailCategory,
  createCalendarEvent: tracedCreateCalendarEvent,
  getCalendarEvent: tracedGetCalendarEvent,
  listCalendarEvents: tracedListCalendarEvents,
  updateCalendarEvent: tracedUpdateCalendarEvent,
  deleteCalendarEvent: tracedDeleteCalendarEvent,
  checkConflicts: tracedCheckConflicts,
  listCalendars: tracedListCalendars
} = traced;

export {
  tracedEMAIL_SIZE_LIMITS as EMAIL_SIZE_LIMITS,
  tracedGetValidAccessToken as getValidAccessToken,
  tracedSendEmail as sendEmail,
  tracedReadEmail as readEmail,
  tracedGetEmailPreview as getEmailPreview,
  tracedSearchEmails as searchEmails,
  tracedListFollowupCandidates as listFollowupCandidates,
  tracedReplyToEmail as replyToEmail,
  tracedCreateDraft as createDraft,
  tracedSendDraft as sendDraft,
  tracedDeleteEmail as deleteEmail,
  tracedToggleStar as toggleStar,
  tracedMarkAsRead as markAsRead,
  tracedListLabels as listLabels,
  tracedResolveLabelIdentifiers as resolveLabelIdentifiers,
  tracedModifyMessageLabels as modifyMessageLabels,
  tracedModifyThreadLabels as modifyThreadLabels,
  tracedGetThread as getThread,
  tracedSetThreadRead as setThreadRead,
  tracedReplyToThread as replyToThread,
  tracedGetAttachmentMeta as getAttachmentMeta,
  tracedPreviewAttachmentText as previewAttachmentText,
  tracedPreviewAttachmentTable as previewAttachmentTable,
  tracedDownloadAttachment as downloadAttachment,
  tracedClassifyEmailCategory as classifyEmailCategory,
  tracedCreateCalendarEvent as createCalendarEvent,
  tracedGetCalendarEvent as getCalendarEvent,
  tracedListCalendarEvents as listCalendarEvents,
  tracedUpdateCalendarEvent as updateCalendarEvent,
  tracedDeleteCalendarEvent as deleteCalendarEvent,
  tracedCheckConflicts as checkConflicts,
  tracedListCalendars as listCalendars
};
