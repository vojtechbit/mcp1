import * as gmailService from '../services/googleApiService.js';

/**
 * Send an email
 * POST /api/gmail/send
 * Body: { to, subject, body, cc?, bcc? }
 */
async function sendEmail(req, res) {
  try {
    const { to, subject, body, cc, bcc } = req.body;

    // Validate required fields
    if (!to || !subject || !body) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: to, subject, body'
      });
    }

    console.log(`📧 Sending email to ${to}...`);

    const result = await gmailService.sendEmail(req.user.googleSub, {
      to, subject, body, cc, bcc
    });

    res.json({
      success: true,
      messageId: result.id,
      message: 'Email sent successfully',
      preview: {
        to: to,
        subject: subject,
        body: body,
        cc: cc || null,
        bcc: bcc || null
      }
    });

  } catch (error) {
    console.error('❌ Failed to send email');
    
    // Check if it's an auth error that requires re-authentication
    if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message || 'Your session has expired. Please log in again.',
        code: error.code || 'AUTH_REQUIRED',
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Email send failed',
      message: error.message
    });
  }
}

/**
 * Read an email with optional format parameter
 * GET /api/gmail/read/:messageId?format=full|metadata|snippet|minimal
 * 
 * Query parameters:
 * - format: 'full' (default), 'metadata', 'snippet', 'minimal'
 * - autoTruncate: true (default), false - automatically truncate large emails
 */
async function readEmail(req, res) {
  try {
    const { messageId } = req.params;
    const { format = 'full', autoTruncate = 'true' } = req.query;

    // Convert autoTruncate string to boolean
    const autoTruncateBoolean = autoTruncate === 'true' || autoTruncate === '1';

    console.log(`📖 Reading email ${messageId} (format: ${format}, autoTruncate: ${autoTruncateBoolean})...`);

    const result = await gmailService.readEmail(
      req.user.googleSub, 
      messageId,
      { format, autoTruncate: autoTruncateBoolean }
    );

    // Přidat informace o formátu do response
    const response = {
      success: true,
      message: result,
      format: format
    };

    // Pokud byl email zkrácen, přidat info
    if (result.truncated) {
      response.truncated = true;
      response.truncationInfo = result.truncationInfo;
      response.note = 'Email byl zkrácen kvůli velikosti. Pro zjištění více informací použijte format=metadata.';
    }

    res.json(response);

  } catch (error) {
    console.error('❌ Failed to read email');
    
    if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message || 'Your session has expired. Please log in again.',
        code: error.code || 'AUTH_REQUIRED',
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Email read failed',
      message: error.message
    });
  }
}

/**
 * Get email snippet (quick preview)
 * GET /api/gmail/snippet/:messageId
 * 
 * This endpoint always returns just the snippet and basic metadata,
 * making it fast and lightweight for previewing emails.
 */
async function getEmailSnippet(req, res) {
  try {
    const { messageId } = req.params;

    console.log(`👀 Getting email snippet ${messageId}...`);

    const result = await gmailService.readEmail(
      req.user.googleSub, 
      messageId,
      { format: 'snippet' }
    );

    res.json({
      success: true,
      snippet: result.snippet,
      messageId: result.id,
      sizeEstimate: result.sizeEstimate,
      headers: result.headers,
      note: 'Toto je jen náhled emailu. Pro celý obsah použijte /api/gmail/read/:messageId'
    });

  } catch (error) {
    console.error('❌ Failed to get email snippet');
    
    if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message || 'Your session has expired. Please log in again.',
        code: error.code || 'AUTH_REQUIRED',
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Email snippet retrieval failed',
      message: error.message
    });
  }
}

/**
 * Search emails
 * GET /api/gmail/search?query=...&maxResults=10
 */
async function searchEmails(req, res) {
  try {
    const { query, maxResults, pageToken } = req.query;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required parameter: query'
      });
    }

    console.log(`🔍 Searching emails with query: ${query}`);

    const result = await gmailService.searchEmails(req.user.googleSub, {
      query,
      maxResults: parseInt(maxResults) || 10,
      pageToken
    });

    // Get actual count instead of estimate
    const actualCount = result.messages ? result.messages.length : 0;
    
    res.json({
      success: true,
      results: result.messages || [],
      count: actualCount, // Actual number of results returned
      resultSizeEstimate: result.resultSizeEstimate, // Gmail's estimate (often inaccurate)
      nextPageToken: result.nextPageToken,
      note: actualCount > 0 && actualCount !== result.resultSizeEstimate ? 
        'Note: resultSizeEstimate is Gmail\'s estimate and may not match actual count. Use "count" for accurate number.' : null
    });

  } catch (error) {
    console.error('❌ Failed to search emails');
    
    if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message || 'Your session has expired. Please log in again.',
        code: error.code || 'AUTH_REQUIRED',
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Email search failed',
      message: error.message
    });
  }
}

/**
 * Reply to an email
 * POST /api/gmail/reply/:messageId
 * Body: { body }
 */
async function replyToEmail(req, res) {
  try {
    const { messageId } = req.params;
    const { body } = req.body;

    if (!body) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required field: body'
      });
    }

    console.log(`↩️  Replying to email ${messageId}...`);

    const result = await gmailService.replyToEmail(req.user.googleSub, messageId, { body });

    res.json({
      success: true,
      messageId: result.id,
      message: 'Reply sent successfully'
    });

  } catch (error) {
    console.error('❌ Failed to reply to email');
    
    if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message || 'Your session has expired. Please log in again.',
        code: error.code || 'AUTH_REQUIRED',
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Email reply failed',
      message: error.message
    });
  }
}

/**
 * Create a draft
 * POST /api/gmail/draft
 * Body: { to, subject, body }
 */
async function createDraft(req, res) {
  try {
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: to, subject, body'
      });
    }

    console.log(`📝 Creating draft to ${to}...`);

    const result = await gmailService.createDraft(req.user.googleSub, {
      to, subject, body
    });

    res.json({
      success: true,
      draftId: result.id,
      message: 'Draft created successfully'
    });

  } catch (error) {
    console.error('❌ Failed to create draft');
    
    // Check if it's an auth error
    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired or you need to grant additional permissions. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      error: 'Draft creation failed',
      message: error.message
    });
  }
}

/**
 * Delete an email (move to trash)
 * DELETE /api/gmail/:messageId
 */
async function deleteEmail(req, res) {
  try {
    const { messageId } = req.params;

    console.log(`🗑️  Deleting email ${messageId}...`);

    const result = await gmailService.deleteEmail(req.user.googleSub, messageId);

    res.json({
      success: true,
      messageId: result.messageId,
      message: 'Email moved to trash'
    });

  } catch (error) {
    console.error('❌ Failed to delete email');
    
    if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message || 'Your session has expired. Please log in again.',
        code: error.code || 'AUTH_REQUIRED',
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Email deletion failed',
      message: error.message
    });
  }
}

/**
 * Star/unstar an email
 * PATCH /api/gmail/:messageId/star
 * Body: { star: true/false }
 */
async function toggleStar(req, res) {
  try {
    const { messageId } = req.params;
    const { star } = req.body;

    if (typeof star !== 'boolean') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing or invalid field: star (must be boolean)'
      });
    }

    console.log(`⭐ ${star ? 'Starring' : 'Unstarring'} email ${messageId}...`);

    const result = await gmailService.toggleStar(req.user.googleSub, messageId, star);

    res.json({
      success: true,
      messageId: result.messageId,
      starred: result.starred,
      message: `Email ${star ? 'starred' : 'unstarred'} successfully`
    });

  } catch (error) {
    console.error('❌ Failed to toggle star');
    
    if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message || 'Your session has expired. Please log in again.',
        code: error.code || 'AUTH_REQUIRED',
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Star toggle failed',
      message: error.message
    });
  }
}

/**
 * Mark email as read/unread
 * PATCH /api/gmail/:messageId/read
 * Body: { read: true/false }
 */
async function markAsRead(req, res) {
  try {
    const { messageId } = req.params;
    const { read } = req.body;

    if (typeof read !== 'boolean') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing or invalid field: read (must be boolean)'
      });
    }

    console.log(`✅ Marking email ${messageId} as ${read ? 'read' : 'unread'}...`);

    const result = await gmailService.markAsRead(req.user.googleSub, messageId, read);

    res.json({
      success: true,
      messageId: result.messageId,
      read: result.read,
      message: `Email marked as ${read ? 'read' : 'unread'}`
    });

  } catch (error) {
    console.error('❌ Failed to mark as read');
    
    if (error.code === 'AUTH_REQUIRED' || error.code === 'REFRESH_TOKEN_INVALID' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message || 'Your session has expired. Please log in again.',
        code: error.code || 'AUTH_REQUIRED',
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Mark as read failed',
      message: error.message
    });
  }
}

export {
  sendEmail,
  readEmail,
  getEmailSnippet,
  searchEmails,
  replyToEmail,
  createDraft,
  deleteEmail,
  toggleStar,
  markAsRead
};
