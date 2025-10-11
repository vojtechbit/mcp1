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
    res.status(500).json({
      error: 'Email send failed',
      message: error.message
    });
  }
}

/**
 * Read an email
 * GET /api/gmail/read/:messageId
 */
async function readEmail(req, res) {
  try {
    const { messageId } = req.params;

    console.log(`📖 Reading email ${messageId}...`);

    const result = await gmailService.readEmail(req.user.googleSub, messageId);

    res.json({
      success: true,
      message: result
    });

  } catch (error) {
    console.error('❌ Failed to read email');
    res.status(500).json({
      error: 'Email read failed',
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

    res.json({
      success: true,
      results: result.messages || [],
      resultSizeEstimate: result.resultSizeEstimate,
      nextPageToken: result.nextPageToken
    });

  } catch (error) {
    console.error('❌ Failed to search emails');
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
    res.status(500).json({
      error: 'Mark as read failed',
      message: error.message
    });
  }
}

export {
  sendEmail,
  readEmail,
  searchEmails,
  replyToEmail,
  createDraft,
  deleteEmail,
  toggleStar,
  markAsRead
};
