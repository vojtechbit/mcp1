import * as gmailService from '../services/googleApiService.js';
import { heavyLimiter } from '../server.js';
import { 
  parseRelativeTime, 
  normalizeQuery as normalizeQueryUtil, 
  computeETag, 
  checkETagMatch 
} from '../utils/helpers.js';
import { createSnapshot, getSnapshot } from '../utils/snapshotStore.js';
import { 
  PAGE_SIZE_DEFAULT, 
  PAGE_SIZE_MAX, 
  BATCH_PREVIEW_MAX_IDS, 
  BATCH_READ_MAX_IDS,
  BATCH_READ_CONCURRENCY,
  AGGREGATE_CAP_MAIL 
} from '../config/limits.js';

/**
 * Send an email
 * POST /api/gmail/send
 * Body: { to?, subject, body, cc?, bcc?, toSelf?, confirmSelfSend? }
 * 
 * Send-to-self support:
 * - If toSelf=true and confirmSelfSend=true, send to currentUser.primaryEmail
 * - If toSelf=true but confirmSelfSend is not true, return 400
 * - If explicit "to" is provided, ignore toSelf
 */
async function sendEmail(req, res) {
  try {
    let { to, subject, body, cc, bcc, toSelf, confirmSelfSend } = req.body;

    // Handle send-to-self
    if (toSelf && !to) {
      if (!confirmSelfSend) {
        return res.status(400).json({
          error: 'Confirmation required',
          message: 'To send email to yourself, confirmSelfSend must be true',
          code: 'CONFIRM_SELF_SEND_REQUIRED'
        });
      }
      // Get user's email from the session/profile
      to = req.user.email || req.user.primaryEmail;
      if (!to) {
        return res.status(400).json({
          error: 'User email not available',
          message: 'Cannot determine your email address for send-to-self'
        });
      }
    }

    // Validate required fields
    if (!to || !subject || !body) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: to (or toSelf), subject, body'
      });
    }

    console.log(`📧 Sending email to ${to}${toSelf ? ' (self)' : ''}...`);

    const result = await gmailService.sendEmail(req.user.googleSub, {
      to, subject, body, cc, bcc
    });

    res.json({
      success: true,
      messageId: result.id,
      message: 'Email sent successfully',
      sentToSelf: toSelf === true,
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
 * Reply to an email
 * POST /api/gmail/reply/:messageId
 * Body: { body, toSelf?, confirmSelfSend? }
 * 
 * Send-to-self support:
 * - If toSelf=true and confirmSelfSend=true, reply to yourself
 * - If toSelf=true but confirmSelfSend is not true, return 400
 */
async function replyToEmail(req, res) {
  try {
    const { messageId } = req.params;
    let { body, toSelf, confirmSelfSend } = req.body;

    if (!body) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required field: body'
      });
    }

    // Handle send-to-self for replies
    if (toSelf && !confirmSelfSend) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'To reply to yourself, confirmSelfSend must be true',
        code: 'CONFIRM_SELF_SEND_REQUIRED'
      });
    }

    console.log(`↩️  Replying to email ${messageId}${toSelf ? ' (self)' : ''}...`);

    const result = await gmailService.replyToEmail(req.user.googleSub, messageId, { body });

    res.json({
      success: true,
      messageId: result.id,
      message: 'Reply sent successfully',
      repliedToSelf: toSelf === true
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
 * Read an email with optional format parameter
 * GET /api/gmail/read/:messageId?format=full|metadata|snippet|minimal
 * 
 * Auto-routes to batchRead if more than 5 IDs provided as comma-separated string
 * Query parameters:
 * - format: 'full' (default), 'metadata', 'snippet', 'minimal'
 * - autoTruncate: true (default), false
 */
async function readEmail(req, res) {
  try {
    const { messageId } = req.params;
    const { format = 'full', autoTruncate = 'true' } = req.query;

    // Check if messageId contains multiple IDs (comma-separated)
    const ids = messageId.split(',').map(id => id.trim()).filter(id => id);
    
    if (ids.length > 5) {
      // Route to batch read
      console.log(`📚 Auto-routing to batch read (${ids.length} IDs)`);
      req.body = { ids };
      return batchRead(req, res);
    }

    const autoTruncateBoolean = autoTruncate === 'true' || autoTruncate === '1';

    console.log(`📖 Reading email ${messageId} (format: ${format}, autoTruncate: ${autoTruncateBoolean})...`);

    const result = await gmailService.readEmail(
      req.user.googleSub, 
      messageId,
      { format, autoTruncate: autoTruncateBoolean }
    );

    // ETag support
    const etag = computeETag(result);
    if (checkETagMatch(req.headers['if-none-match'], etag)) {
      return res.status(304).end();
    }

    const response = {
      success: true,
      message: result,
      format: format,
      truncated: result.truncated || false,
      sizeEstimate: result.sizeEstimate,
      webViewUrl: result.webViewUrl || `https://mail.google.com/mail/u/0/#inbox/${messageId}`
    };

    if (result.truncated) {
      response.truncationInfo = result.truncationInfo;
    }

    res.setHeader('ETag', etag);
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
 * Batch preview endpoint
 * POST /mail/batchPreview
 * Body: { ids: string[], kind: "summary"|"snippet"|"metadata" }
 * 
 * Enforces BATCH_PREVIEW_MAX_IDS limit (chunks internally if needed)
 * Returns combined response with all items
 */
async function batchPreview(req, res) {
  try {
    const { ids, kind = 'summary' } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing or invalid field: ids (must be non-empty array)'
      });
    }

    if (!['summary', 'snippet', 'metadata'].includes(kind)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid kind. Must be: summary, snippet, or metadata'
      });
    }

    console.log(`📚 Batch preview: ${ids.length} IDs (kind: ${kind})`);

    // Chunk if exceeds limit
    const chunks = [];
    for (let i = 0; i < ids.length; i += BATCH_PREVIEW_MAX_IDS) {
      chunks.push(ids.slice(i, i + BATCH_PREVIEW_MAX_IDS));
    }

    let allResults = [];

    for (const chunk of chunks) {
      const chunkResults = await fetchBatchPreview(req.user.googleSub, chunk, kind);
      allResults = allResults.concat(chunkResults);
    }

    res.json({
      success: true,
      idsRequested: ids.length,
      idsReturned: allResults.length,
      kind,
      items: allResults
    });

  } catch (error) {
    console.error('❌ Failed batch preview');
    
    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      error: 'Batch preview failed',
      message: error.message
    });
  }
}

/**
 * Helper: fetch batch preview items
 */
async function fetchBatchPreview(googleSub, ids, kind) {
  const results = [];
  
  // Process in small batches with concurrency limit
  for (let i = 0; i < ids.length; i += BATCH_READ_CONCURRENCY) {
    const batch = ids.slice(i, i + BATCH_READ_CONCURRENCY);
    
    const promises = batch.map(async (id) => {
      try {
        if (kind === 'summary') {
          const msg = await gmailService.readEmail(googleSub, id, { format: 'metadata' });
          return {
            id,
            from: msg.from,
            subject: msg.subject,
            internalDate: msg.internalDate
          };
        } else if (kind === 'snippet') {
          const msg = await gmailService.readEmail(googleSub, id, { format: 'snippet' });
          return {
            id,
            snippet: msg.snippet
          };
        } else {
          // metadata
          const msg = await gmailService.readEmail(googleSub, id, { format: 'metadata' });
          return msg;
        }
      } catch (err) {
        console.error(`Failed to fetch ${kind} for ${id}:`, err.message);
        return { id, error: err.message };
      }
    });
    
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Batch read endpoint
 * POST /mail/batchRead
 * Body: { ids: string[] }
 * 
 * Enforces BATCH_READ_MAX_IDS limit
 * Truncates body to 2000 characters per message
 */
async function batchRead(req, res) {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing or invalid field: ids (must be non-empty array)'
      });
    }

    // Enforce limit
    const limitedIds = ids.slice(0, BATCH_READ_MAX_IDS);
    const truncated = ids.length > BATCH_READ_MAX_IDS;

    console.log(`📚 Batch read: ${limitedIds.length} IDs (truncated: ${truncated})`);

    const results = [];

    // Process in small batches with concurrency limit
    for (let i = 0; i < limitedIds.length; i += BATCH_READ_CONCURRENCY) {
      const batch = limitedIds.slice(i, i + BATCH_READ_CONCURRENCY);
      
      const promises = batch.map(async (id) => {
        try {
          const msg = await gmailService.readEmail(req.user.googleSub, id, {
            format: 'full',
            autoTruncate: true
          });
          
          // Truncate body to 2000 chars for batch
          if (msg.body && msg.body.length > 2000) {
            msg.body = msg.body.substring(0, 2000) + '... [truncated for batch]';
            msg.truncated = true;
          }
          
          return msg;
        } catch (err) {
          console.error(`Failed to read email ${id}:`, err.message);
          return { id, error: err.message };
        }
      });
      
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    const response = {
      success: true,
      idsRequested: ids.length,
      idsReturned: results.length,
      items: results
    };

    if (truncated) {
      response.note = `Request truncated to ${BATCH_READ_MAX_IDS} items due to limit`;
    }

    // If auto-routed from readEmail
    if (req.body._autoRouted) {
      response.routed = 'batch';
    }

    res.json(response);

  } catch (error) {
    console.error('❌ Failed batch read');
    
    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      error: 'Batch read failed',
      message: error.message
    });
  }
}

/**
 * Get email snippet (quick preview)
 * GET /api/gmail/snippet/:messageId
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

    // ETag support
    const etag = computeETag(result);
    if (checkETagMatch(req.headers['if-none-match'], etag)) {
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.json({
      success: true,
      snippet: result.snippet,
      messageId: result.id,
      sizeEstimate: result.sizeEstimate,
      headers: result.headers
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
 * GET /api/gmail/search?query=...&maxResults=100&pageToken=...&aggregate=true&include=summary&normalizeQuery=true&relative=today&snapshotToken=...
 * 
 * NEW Features:
 * - aggregate=true: paginate internally until AGGREGATE_CAP_MAIL or exhaustion
 * - include=summary: fetch summaries for ALL returned IDs (batched internally)
 * - normalizeQuery=true: normalize query (strip diacritics, alias expansion)
 * - relative=today|tomorrow|thisWeek|lastHour: translate to after/before
 * - snapshotToken: use existing snapshot for stable iteration
 * - ETag support for caching
 */
async function searchEmails(req, res) {
  // Apply heavy limiter if aggregate=true
  const runSearch = async (req, res) => {
    try {
      let { 
        query, 
        maxResults, 
        pageToken, 
        aggregate, 
        include, 
        normalizeQuery: normalizeQueryFlag,
        relative,
        snapshotToken
      } = req.query;

      if (!query && !relative) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required parameter: query (or relative)'
        });
      }

      // Handle relative time
      if (relative) {
        const times = parseRelativeTime(relative);
        if (!times) {
          return res.status(400).json({
            error: 'Bad Request',
            message: `Invalid relative time: ${relative}. Must be: today, tomorrow, thisWeek, or lastHour`
          });
        }
        // Append to query using Unix timestamps
        query = `${query || ''} after:${times.after} before:${times.before}`.trim();
      }

      // Normalize query if requested
      let originalQuery = query;
      if (normalizeQueryFlag === 'true') {
        query = normalizeQueryUtil(query);
      }

      // Handle snapshot token
      let snapshot = null;
      if (snapshotToken) {
        snapshot = getSnapshot(snapshotToken);
        if (!snapshot) {
          return res.status(400).json({
            error: 'Invalid or expired snapshot token',
            message: 'Please start a new search'
          });
        }
      }

      const aggregateMode = aggregate === 'true';
      const includeSummary = include === 'summary';

      console.log(`🔍 Searching emails: "${query}" (aggregate: ${aggregateMode}, summary: ${includeSummary})`);

      if (aggregateMode) {
        // Aggregate mode: paginate internally
        let allItems = [];
        let currentPageToken = pageToken;
        let pagesConsumed = 0;
        let hasMore = false;
        let partial = false;

        while (true) {
          const result = await gmailService.searchEmails(req.user.googleSub, {
            query,
            maxResults: PAGE_SIZE_DEFAULT,
            pageToken: currentPageToken
          });

          const items = result.messages || [];
          allItems = allItems.concat(items);
          pagesConsumed++;

          // Check if we hit the cap
          if (allItems.length >= AGGREGATE_CAP_MAIL) {
            hasMore = true;
            partial = true;
            allItems = allItems.slice(0, AGGREGATE_CAP_MAIL);
            break;
          }

          // Check if there are more pages
          if (result.nextPageToken) {
            currentPageToken = result.nextPageToken;
          } else {
            hasMore = false;
            break;
          }
        }

        // Fetch summaries if requested
        let summariesReturned = 0;
        let summariesPartial = false;

        if (includeSummary && allItems.length > 0) {
          const ids = allItems.map(item => item.id);
          const summaries = await fetchBatchPreview(req.user.googleSub, ids, 'summary');
          
          // Merge summaries into items
          const summaryMap = new Map(summaries.map(s => [s.id, s]));
          allItems = allItems.map(item => ({
            ...item,
            summary: summaryMap.get(item.id)
          }));

          summariesReturned = summaries.filter(s => !s.error).length;
          summariesPartial = summariesReturned < ids.length;
        }

        // Create snapshot token
        const newSnapshotToken = createSnapshot(query, { aggregate: true });

        const response = {
          success: true,
          items: allItems,
          totalExact: allItems.length,
          pagesConsumed,
          hasMore,
          partial,
          snapshotToken: newSnapshotToken,
          idsReturned: allItems.length
        };

        if (includeSummary) {
          response.summariesReturned = summariesReturned;
          if (summariesPartial) {
            response.summariesPartial = true;
          }
        }

        if (normalizeQueryFlag === 'true') {
          response.originalQuery = originalQuery;
          response.normalizedQuery = query;
        }

        // ETag support
        const etag = computeETag(response);
        if (checkETagMatch(req.headers['if-none-match'], etag)) {
          return res.status(304).end();
        }

        res.setHeader('ETag', etag);
        return res.json(response);

      } else {
        // Normal mode: single page
        const pageSize = Math.min(
          parseInt(maxResults) || PAGE_SIZE_DEFAULT,
          PAGE_SIZE_MAX
        );

        const result = await gmailService.searchEmails(req.user.googleSub, {
          query,
          maxResults: pageSize,
          pageToken
        });

        const items = result.messages || [];
        const hasMore = !!result.nextPageToken;
        const nextPageToken = result.nextPageToken;

        // Fetch summaries if requested
        let summariesReturned = 0;
        let summariesPartial = false;

        if (includeSummary && items.length > 0) {
          const ids = items.map(item => item.id);
          const summaries = await fetchBatchPreview(req.user.googleSub, ids, 'summary');
          
          // Merge summaries into items
          const summaryMap = new Map(summaries.map(s => [s.id, s]));
          const itemsWithSummary = items.map(item => ({
            ...item,
            summary: summaryMap.get(item.id)
          }));

          summariesReturned = summaries.filter(s => !s.error).length;
          summariesPartial = summariesReturned < ids.length;

          const response = {
            success: true,
            items: itemsWithSummary,
            hasMore,
            nextPageToken,
            idsReturned: items.length,
            summariesReturned
          };

          if (summariesPartial) {
            response.summariesPartial = true;
          }

          if (normalizeQueryFlag === 'true') {
            response.originalQuery = originalQuery;
            response.normalizedQuery = query;
          }

          // ETag support
          const etag = computeETag(response);
          if (checkETagMatch(req.headers['if-none-match'], etag)) {
            return res.status(304).end();
          }

          res.setHeader('ETag', etag);
          return res.json(response);
        }

        const response = {
          success: true,
          items,
          hasMore,
          nextPageToken,
          idsReturned: items.length
        };

        if (normalizeQueryFlag === 'true') {
          response.originalQuery = originalQuery;
          response.normalizedQuery = query;
        }

        // ETag support
        const etag = computeETag(response);
        if (checkETagMatch(req.headers['if-none-match'], etag)) {
          return res.status(304).end();
        }

        res.setHeader('ETag', etag);
        return res.json(response);
      }

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
  };

  // Apply heavy limiter if aggregate mode
  if (req.query.aggregate === 'true') {
    heavyLimiter(req, res, () => runSearch(req, res));
  } else {
    runSearch(req, res);
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
  replyToEmail,
  readEmail,
  batchPreview,
  batchRead,
  getEmailSnippet,
  searchEmails,
  createDraft,
  deleteEmail,
  toggleStar,
  markAsRead
};
