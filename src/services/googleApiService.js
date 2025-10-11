import { google } from 'googleapis';
import { refreshAccessToken } from '../config/oauth.js';
import { getUserByGoogleSub, updateTokens, updateLastUsed } from './databaseService.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create authenticated Google API client
 * Creates a NEW OAuth2 client instance for each request to avoid conflicts
 */
async function getAuthenticatedClient(googleSub) {
  const accessToken = await getValidAccessToken(googleSub);
  
  // Create NEW OAuth2 client instance for this request
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
 * Wrapper to handle Google API errors (especially 401 auth errors)
 */
async function handleGoogleApiCall(apiCall, errorContext = {}) {
  try {
    return await apiCall();
  } catch (error) {
    // Check if it's a 401 authentication error
    if (error.code === 401 || error.message?.includes('Login Required') || error.message?.includes('Invalid Credentials')) {
      console.error('❌ Google API returned 401 - authentication required');
      const authError = new Error('Authentication required - please log in again');
      authError.code = 'AUTH_REQUIRED';
      authError.statusCode = 401;
      throw authError;
    }
    
    // Re-throw other errors with context
    throw error;
  }
}

/**
 * Get valid access token (auto-refresh if expired)
 */
async function getValidAccessToken(googleSub) {
  try {
    const user = await getUserByGoogleSub(googleSub);
    
    if (!user) {
      throw new Error('User not found in database');
    }

    updateLastUsed(googleSub).catch(err => 
      console.error('Failed to update last_used:', err.message)
    );

    const now = new Date();
    const expiry = new Date(user.tokenExpiry);
    const bufferTime = 5 * 60 * 1000;

    if (now >= (expiry.getTime() - bufferTime)) {
      console.log('🔄 Access token expired, refreshing...');
      
      try {
        const newTokens = await refreshAccessToken(user.refreshToken);
        // Google returns expiry_date as seconds until expiration
        const expiryDate = new Date(Date.now() + ((newTokens.expiry_date || 3600) * 1000));
        
        await updateTokens(googleSub, {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token || user.refreshToken,
          expiryDate
        });

        console.log('✅ Access token refreshed successfully');
        return newTokens.access_token;
      } catch (refreshError) {
        console.error('❌ Token refresh failed - user needs to re-authenticate');
        // Create special error that controllers can catch
        const authError = new Error('Authentication required - please log in again');
        authError.code = 'AUTH_REQUIRED';
        authError.statusCode = 401;
        throw authError;
      }
    }

    return user.accessToken;
  } catch (error) {
    console.error('❌ [TOKEN_ERROR] Failed to get valid access token');
    console.error('Details:', {
      googleSub,
      errorMessage: error.message,
      errorCode: error.code,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

// ==================== GMAIL FUNCTIONS ====================

/**
 * Send an email
 * @param {string} googleSub - User's Google ID
 * @param {object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Email body
 * @param {string} [options.cc] - CC recipients
 * @param {string} [options.bcc] - BCC recipients
 * @param {boolean} [options.includeMcp1Attribution=false] - Add MCP1 branding at end (default: false)
 */
async function sendEmail(googleSub, { to, subject, body, cc, bcc, includeMcp1Attribution = false }) {
  try {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // Add optional MCP1 attribution/branding
    const attribution = includeMcp1Attribution 
      ? '\n\n---\nPosláno z MCP1 OAuth Proxy Server'
      : '';
    
    const fullBody = body + attribution;

    // RFC 2047 encoding for Subject with UTF-8 characters
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
    
    messageParts.push('');  // Empty line before body
    messageParts.push(fullBody);

    const message = messageParts.join('\r\n');
    
    // Base64url encode the entire message
    const encodedMessage = Buffer.from(message, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage }
    });

    console.log('✅ Email sent successfully:', result.data.id);
    return result.data;
  } catch (error) {
    console.error('❌ [GMAIL_ERROR] Failed to send email');
    console.error('Details:', {
      to, subject,
      errorMessage: error.message,
      statusCode: error.response?.status,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Read a specific email
 */
async function readEmail(googleSub, messageId) {
  try {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const result = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    console.log('✅ Email read successfully:', messageId);
    return result.data;
  } catch (error) {
    console.error('❌ [GMAIL_ERROR] Failed to read email');
    console.error('Details:', {
      messageId,
      errorMessage: error.message,
      statusCode: error.response?.status,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Search emails with query
 */
async function searchEmails(googleSub, { query, maxResults = 10, pageToken }) {
  try {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const params = {
      userId: 'me',
      q: query,
      maxResults
    };

    if (pageToken) params.pageToken = pageToken;

    const result = await gmail.users.messages.list(params);

    console.log('✅ Email search completed:', result.data.resultSizeEstimate);
    return result.data;
  } catch (error) {
    console.error('❌ [GMAIL_ERROR] Failed to search emails');
    console.error('Details:', {
      query,
      errorMessage: error.message,
      statusCode: error.response?.status,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Reply to an email
 */
async function replyToEmail(googleSub, messageId, { body }) {
  try {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // Get original message to extract headers
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

    // Create reply
    const messageParts = [
      `To: ${originalFrom}`,
      `Subject: Re: ${originalSubject?.replace(/^Re: /, '')}`,
      `In-Reply-To: ${originalMessageId}`,
      `References: ${originalMessageId}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      '',
      body
    ];

    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
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

    console.log('✅ Reply sent successfully:', result.data.id);
    return result.data;
  } catch (error) {
    console.error('❌ [GMAIL_ERROR] Failed to reply to email');
    console.error('Details:', {
      messageId,
      errorMessage: error.message,
      statusCode: error.response?.status,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Create a draft
 */
async function createDraft(googleSub, { to, subject, body }) {
  try {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const messageParts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body
    ];

    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
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

    console.log('✅ Draft created:', result.data.id);
    return result.data;
  } catch (error) {
    console.error('❌ [GMAIL_ERROR] Failed to create draft');
    console.error('Details:', {
      to, subject,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Delete an email (move to trash)
 */
async function deleteEmail(googleSub, messageId) {
  try {
    const authClient = await getAuthenticatedClient(googleSub);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    await gmail.users.messages.trash({
      userId: 'me',
      id: messageId
    });

    console.log('✅ Email moved to trash:', messageId);
    return { success: true, messageId };
  } catch (error) {
    console.error('❌ [GMAIL_ERROR] Failed to delete email');
    console.error('Details:', {
      messageId,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Star/unstar an email
 */
async function toggleStar(googleSub, messageId, star = true) {
  try {
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

    console.log(`✅ Email ${star ? 'starred' : 'unstarred'}:`, messageId);
    return { success: true, messageId, starred: star };
  } catch (error) {
    console.error('❌ [GMAIL_ERROR] Failed to toggle star');
    console.error('Details:', {
      messageId, star,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Mark email as read/unread
 */
async function markAsRead(googleSub, messageId, read = true) {
  try {
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

    console.log(`✅ Email marked as ${read ? 'read' : 'unread'}:`, messageId);
    return { success: true, messageId, read };
  } catch (error) {
    console.error('❌ [GMAIL_ERROR] Failed to mark as read');
    console.error('Details:', {
      messageId, read,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

// ==================== CALENDAR FUNCTIONS ====================

/**
 * Create a calendar event (with optional attendees)
 * @param {string} googleSub - User's Google ID
 * @param {object} eventData - Event details
 * @param {boolean} [eventData.includeMcp1Attribution=true] - Add MCP1 branding to description (default: true)
 */
async function createCalendarEvent(googleSub, eventData) {
  try {
    const authClient = await getAuthenticatedClient(googleSub);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    // Add MCP1 attribution/branding to description (default: true)
    const includeMcp1Attribution = eventData.includeMcp1Attribution !== false; // Default true
    const attribution = includeMcp1Attribution
      ? '\n\n---\nVytvořeno: MCP1 OAuth Proxy Server'
      : '';
    
    const fullDescription = (eventData.description || '') + attribution;

    const event = {
      summary: eventData.summary,
      description: fullDescription,
      start: {
        dateTime: eventData.start,
        timeZone: eventData.timeZone || 'UTC'
      },
      end: {
        dateTime: eventData.end,
        timeZone: eventData.timeZone || 'UTC'
      }
    };

    // Add attendees if provided
    if (eventData.attendees) {
      event.attendees = eventData.attendees.map(email => ({ email }));
    }

    if (eventData.location) {
      event.location = eventData.location;
    }

    if (eventData.reminders) {
      event.reminders = eventData.reminders;
    }

    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: eventData.attendees ? 'all' : 'none' // Send invites if attendees
    });

    console.log('✅ Calendar event created:', result.data.id);
    return result.data;
  } catch (error) {
    console.error('❌ [CALENDAR_ERROR] Failed to create event');
    console.error('Details:', {
      summary: eventData.summary,
      errorMessage: error.message,
      statusCode: error.response?.status,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Get a specific calendar event
 */
async function getCalendarEvent(googleSub, eventId) {
  try {
    const authClient = await getAuthenticatedClient(googleSub);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const result = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId
    });

    console.log('✅ Calendar event retrieved:', eventId);
    return result.data;
  } catch (error) {
    console.error('❌ [CALENDAR_ERROR] Failed to get event');
    console.error('Details:', {
      eventId,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * List calendar events
 */
async function listCalendarEvents(googleSub, { timeMin, timeMax, maxResults = 10, query }) {
  try {
    const authClient = await getAuthenticatedClient(googleSub);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const params = {
      calendarId: 'primary',
      timeMin: timeMin || new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime'
    };

    if (timeMax) params.timeMax = timeMax;
    if (query) params.q = query;

    const result = await calendar.events.list(params);

    console.log('✅ Calendar events listed:', result.data.items?.length || 0);
    return result.data;
  } catch (error) {
    console.error('❌ [CALENDAR_ERROR] Failed to list events');
    console.error('Details:', {
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Update a calendar event
 */
async function updateCalendarEvent(googleSub, eventId, updates) {
  try {
    const authClient = await getAuthenticatedClient(googleSub);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const existing = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId
    });

    const updatedEvent = {
      ...existing.data,
      ...updates
    };

    const result = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: updatedEvent
    });

    console.log('✅ Calendar event updated:', eventId);
    return result.data;
  } catch (error) {
    console.error('❌ [CALENDAR_ERROR] Failed to update event');
    console.error('Details:', {
      eventId,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Delete a calendar event
 */
async function deleteCalendarEvent(googleSub, eventId) {
  try {
    const authClient = await getAuthenticatedClient(googleSub);
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId
    });

    console.log('✅ Calendar event deleted:', eventId);
    return { success: true, eventId };
  } catch (error) {
    console.error('❌ [CALENDAR_ERROR] Failed to delete event');
    console.error('Details:', {
      eventId,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

export {
  getValidAccessToken,
  sendEmail,
  readEmail,
  searchEmails,
  replyToEmail,
  createDraft,
  deleteEmail,
  toggleStar,
  markAsRead,
  createCalendarEvent,
  getCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEvent
};
