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

// ==================== EMAIL OPERATIONS ====================

async function sendEmail(req, res) {
  try {
    let { to, subject, body, cc, bcc, toSelf, confirmSelfSend } = req.body;

    if (toSelf && !to) {
      if (!confirmSelfSend) {
        return res.status(400).json({
          error: 'Confirmation required',
          message: 'To send email to yourself, confirmSelfSend must be true',
          code: 'CONFIRM_SELF_SEND_REQUIRED'
        });
      }
      to = req.user.email || req.user.primaryEmail;
    }

    if (!to || !subject || !body) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: to, subject, body'
      });
    }

    const result = await gmailService.sendEmail(req.user.googleSub, {
      to, subject, body, cc, bcc
    });

    res.json({
      success: true,
      messageId: result.id,
      threadId: result.threadId,
      message: 'Email sent successfully',
      sentToSelf: toSelf === true,
      preview: { to, subject, body, cc, bcc }
    });
  } catch (error) {
    console.error('❌ Failed to send email:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: error.code,
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Email send failed',
      message: error.message
    });
  }
}

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

    if (toSelf && !confirmSelfSend) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'To reply to yourself, confirmSelfSend must be true',
        code: 'CONFIRM_SELF_SEND_REQUIRED'
      });
    }

    const result = await gmailService.replyToEmail(req.user.googleSub, messageId, { body });

    res.json({
      success: true,
      messageId: result.id,
      threadId: result.threadId,
      message: 'Reply sent successfully',
      repliedToSelf: toSelf === true
    });
  } catch (error) {
    console.error('❌ Failed to reply:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: error.code,
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Email reply failed',
      message: error.message
    });
  }
}

async function readEmail(req, res) {
  try {
    const { messageId } = req.params;
    const { format = 'full', autoTruncate = 'true', includeAttachments = 'false' } = req.query;

    const ids = messageId.split(',').map(id => id.trim()).filter(id => id);
    
    if (ids.length > 5) {
      req.body = { ids };
      return batchRead(req, res);
    }

    const result = await gmailService.readEmail(
      req.user.googleSub, 
      messageId,
      { 
        format, 
        autoTruncate: autoTruncate === 'true',
        includeAttachments: includeAttachments === 'true'
      }
    );

    const etag = computeETag(result);
    if (checkETagMatch(req.headers['if-none-match'], etag)) {
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.json({
      success: true,
      email: result,
      truncated: result.truncated || false
    });
  } catch (error) {
    console.error('❌ Failed to read email:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: error.code,
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Email read failed',
      message: error.message
    });
  }
}

async function getEmailSnippet(req, res) {
  try {
    const { messageId } = req.params;

    const result = await gmailService.readEmail(
      req.user.googleSub, 
      messageId,
      { format: 'snippet' }
    );

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
    console.error('❌ Failed to get snippet:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: error.code,
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Snippet retrieval failed',
      message: error.message
    });
  }
}

/**
 * FIXED: Summary should NOT include snippet
 * According to OpenAPI spec, summary should only have: from, subject, date
 */
async function fetchBatchPreview(googleSub, ids, kind) {
  const results = [];
  
  for (let i = 0; i < ids.length; i += BATCH_READ_CONCURRENCY) {
    const batch = ids.slice(i, i + BATCH_READ_CONCURRENCY);
    
    const promises = batch.map(async (id) => {
      try {
        if (kind === 'summary') {
          const msg = await gmailService.readEmail(googleSub, id, { format: 'metadata' });
          // FIXED: summary should NOT include snippet
          return {
            id,
            from: msg.from,
            subject: msg.subject,
            date: msg.date
          };
        } else if (kind === 'snippet') {
          const msg = await gmailService.readEmail(googleSub, id, { format: 'snippet' });
          return {
            id,
            snippet: msg.snippet
          };
        } else {
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

async function batchPreview(req, res) {
  try {
    const { ids, kind = 'summary' } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing or invalid field: ids'
      });
    }

    if (!['summary', 'snippet', 'metadata'].includes(kind)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid kind. Must be: summary, snippet, or metadata'
      });
    }

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
    console.error('❌ Batch preview failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'AUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      error: 'Batch preview failed',
      message: error.message
    });
  }
}

async function batchRead(req, res) {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing or invalid field: ids'
      });
    }

    const limitedIds = ids.slice(0, BATCH_READ_MAX_IDS);
    const truncated = ids.length > BATCH_READ_MAX_IDS;

    const results = [];

    for (let i = 0; i < limitedIds.length; i += BATCH_READ_CONCURRENCY) {
      const batch = limitedIds.slice(i, i + BATCH_READ_CONCURRENCY);
      
      const promises = batch.map(async (id) => {
        try {
          return await gmailService.readEmail(req.user.googleSub, id, {
            format: 'full',
            autoTruncate: true
          });
        } catch (err) {
          console.error(`Failed to read ${id}:`, err.message);
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
      response.note = `Request truncated to ${BATCH_READ_MAX_IDS} items`;
    }

    res.json(response);
  } catch (error) {
    console.error('❌ Batch read failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'AUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      error: 'Batch read failed',
      message: error.message
    });
  }
}

async function searchEmails(req, res) {
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
        snapshotToken,
        label,
        labelIds
      } = req.query;

      // Handle label filters
      let labelFilter = '';
      if (label) {
        const labels = Array.isArray(label) ? label : [label];
        labelFilter = labels.map(l => `label:${l}`).join(' ');
      }
      if (labelIds) {
        const ids = Array.isArray(labelIds) ? labelIds : [labelIds];
        labelFilter += ' ' + ids.map(id => `label:${id}`).join(' ');
      }

      if (relative) {
        const times = parseRelativeTime(relative);
        if (!times) {
          return res.status(400).json({
            error: 'Bad Request',
            message: `Invalid relative time: ${relative}`
          });
        }
        query = `${query || ''} ${labelFilter} after:${times.after} before:${times.before}`.trim();
      } else {
        query = `${query || ''} ${labelFilter}`.trim();
      }

      let originalQuery = query;
      if (normalizeQueryFlag === 'true') {
        query = normalizeQueryUtil(query);
      }

      const aggregateMode = aggregate === 'true';
      const includeSummary = include === 'summary';

      if (aggregateMode) {
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

          if (allItems.length >= AGGREGATE_CAP_MAIL) {
            hasMore = true;
            partial = true;
            allItems = allItems.slice(0, AGGREGATE_CAP_MAIL);
            break;
          }

          if (result.nextPageToken) {
            currentPageToken = result.nextPageToken;
          } else {
            hasMore = false;
            break;
          }
        }

        let summariesReturned = 0;
        let summariesPartial = false;

        if (includeSummary && allItems.length > 0) {
          const ids = allItems.map(item => item.id);
          const summaries = await fetchBatchPreview(req.user.googleSub, ids, 'summary');
          
          const summaryMap = new Map(summaries.map(s => [s.id, s]));
          allItems = allItems.map(item => ({
            ...item,
            summary: summaryMap.get(item.id)
          }));

          summariesReturned = summaries.filter(s => !s.error).length;
          summariesPartial = summariesReturned < ids.length;
        }

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

        const etag = computeETag(response);
        if (checkETagMatch(req.headers['if-none-match'], etag)) {
          return res.status(304).end();
        }

        res.setHeader('ETag', etag);
        return res.json(response);

      } else {
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

        let summariesReturned = 0;
        let summariesPartial = false;

        if (includeSummary && items.length > 0) {
          const ids = items.map(item => item.id);
          const summaries = await fetchBatchPreview(req.user.googleSub, ids, 'summary');
          
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

        const etag = computeETag(response);
        if (checkETagMatch(req.headers['if-none-match'], etag)) {
          return res.status(304).end();
        }

        res.setHeader('ETag', etag);
        return res.json(response);
      }
    } catch (error) {
      console.error('❌ Search failed:', error.message);
      
      if (error.statusCode === 401) {
        return res.status(401).json({
          error: 'Authentication required',
          message: error.message,
          code: error.code,
          requiresReauth: true
        });
      }
      
      res.status(500).json({
        error: 'Email search failed',
        message: error.message
      });
    }
  };

  if (req.query.aggregate === 'true') {
    heavyLimiter(req, res, () => runSearch(req, res));
  } else {
    runSearch(req, res);
  }
}

async function createDraft(req, res) {
  try {
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: to, subject, body'
      });
    }

    const result = await gmailService.createDraft(req.user.googleSub, {
      to, subject, body
    });

    res.json({
      success: true,
      draftId: result.id,
      message: 'Draft created successfully'
    });
  } catch (error) {
    console.error('❌ Draft creation failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'AUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      error: 'Draft creation failed',
      message: error.message
    });
  }
}

async function deleteEmail(req, res) {
  try {
    const { messageId } = req.params;

    const result = await gmailService.deleteEmail(req.user.googleSub, messageId);

    res.json({
      success: true,
      messageId: result.messageId,
      message: 'Email moved to trash'
    });
  } catch (error) {
    console.error('❌ Delete failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: error.code,
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Email deletion failed',
      message: error.message
    });
  }
}

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

    const result = await gmailService.toggleStar(req.user.googleSub, messageId, star);

    res.json({
      success: true
    });
  } catch (error) {
    console.error('❌ Toggle star failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: error.code,
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Star toggle failed',
      message: error.message
    });
  }
}

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

    const result = await gmailService.markAsRead(req.user.googleSub, messageId, read);

    res.json({
      success: true
    });
  } catch (error) {
    console.error('❌ Mark as read failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: error.code,
        requiresReauth: true
      });
    }
    
    res.status(500).json({
      error: 'Mark as read failed',
      message: error.message
    });
  }
}

// ==================== NEW: LABELS ====================

async function listLabels(req, res) {
  try {
    const labels = await gmailService.listLabels(req.user.googleSub);

    res.json({
      success: true,
      labels
    });
  } catch (error) {
    console.error('❌ List labels failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Label listing failed',
      message: error.message
    });
  }
}

async function modifyMessageLabels(req, res) {
  try {
    const { messageId } = req.params;
    const { add = [], remove = [] } = req.body;

    await gmailService.modifyMessageLabels(req.user.googleSub, messageId, { add, remove });

    res.json({
      success: true
    });
  } catch (error) {
    console.error('❌ Modify labels failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Label modification failed',
      message: error.message
    });
  }
}

async function modifyThreadLabels(req, res) {
  try {
    const { threadId } = req.params;
    const { add = [], remove = [] } = req.body;

    await gmailService.modifyThreadLabels(req.user.googleSub, threadId, { add, remove });

    res.json({
      success: true
    });
  } catch (error) {
    console.error('❌ Modify thread labels failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Thread label modification failed',
      message: error.message
    });
  }
}

// ==================== NEW: THREADS ====================

async function getThread(req, res) {
  try {
    const { threadId } = req.params;

    const thread = await gmailService.getThread(req.user.googleSub, threadId);

    res.json({
      success: true,
      thread
    });
  } catch (error) {
    console.error('❌ Get thread failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Thread retrieval failed',
      message: error.message
    });
  }
}

async function setThreadRead(req, res) {
  try {
    const { threadId } = req.params;
    const { read } = req.body;

    if (typeof read !== 'boolean') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing or invalid field: read (must be boolean)'
      });
    }

    await gmailService.setThreadRead(req.user.googleSub, threadId, read);

    res.json({
      success: true
    });
  } catch (error) {
    console.error('❌ Set thread read failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Thread read status change failed',
      message: error.message
    });
  }
}

async function replyToThread(req, res) {
  try {
    const { threadId } = req.params;
    const { body, toSelf, confirmSelfSend } = req.body;

    if (!body) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required field: body'
      });
    }

    if (toSelf && !confirmSelfSend) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'To reply to yourself, confirmSelfSend must be true',
        code: 'CONFIRM_SELF_SEND_REQUIRED'
      });
    }

    const result = await gmailService.replyToThread(req.user.googleSub, threadId, { body });

    res.json({
      success: true,
      messageId: result.id,
      threadId: result.threadId
    });
  } catch (error) {
    console.error('❌ Reply to thread failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Thread reply failed',
      message: error.message
    });
  }
}

// ==================== NEW: ATTACHMENTS ====================

async function getAttachmentMeta(req, res) {
  try {
    const { messageId, attachmentId } = req.params;

    const attachment = await gmailService.getAttachmentMeta(
      req.user.googleSub,
      messageId,
      attachmentId
    );

    res.json({
      success: true,
      attachment
    });
  } catch (error) {
    console.error('❌ Get attachment meta failed:', error.message);
    
    if (error.statusCode === 451) {
      return res.status(451).json({
        error: 'Attachment blocked',
        message: error.message,
        code: error.code || 'ATTACHMENT_BLOCKED'
      });
    }
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Attachment metadata retrieval failed',
      message: error.message
    });
  }
}

async function previewAttachmentText(req, res) {
  try {
    const { messageId, attachmentId } = req.params;
    const { maxKb = 256 } = req.query;

    const preview = await gmailService.previewAttachmentText(
      req.user.googleSub,
      messageId,
      attachmentId,
      parseInt(maxKb)
    );

    res.json(preview);
  } catch (error) {
    console.error('❌ Preview attachment text failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Attachment text preview failed',
      message: error.message
    });
  }
}

async function previewAttachmentTable(req, res) {
  try {
    const { messageId, attachmentId } = req.params;
    const { sheet = 0, maxRows = 50 } = req.query;

    const preview = await gmailService.previewAttachmentTable(
      req.user.googleSub,
      messageId,
      attachmentId,
      { sheet, maxRows: parseInt(maxRows) }
    );

    res.json(preview);
  } catch (error) {
    console.error('❌ Preview attachment table failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Attachment table preview failed',
      message: error.message
    });
  }
}

/**
 * Download attachment using signed URL
 * This endpoint is called via the signed URL generated by getAttachmentMeta
 */
async function downloadAttachment(req, res) {
  try {
    const { messageId, attachmentId } = req.params;
    const { expires, signature } = req.query;

    if (!expires || !signature) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required parameters: expires, signature'
      });
    }

    // Verify signature
    const { verifySignedUrl } = await import('../utils/signedUrlGenerator.js');
    const verification = verifySignedUrl(messageId, attachmentId, expires, signature);
    
    if (!verification.valid) {
      return res.status(403).json({
        error: 'Forbidden',
        message: verification.error,
        code: verification.code
      });
    }

    // Signature is valid - download the attachment
    const attachment = await gmailService.downloadAttachment(
      req.user.googleSub,
      messageId,
      attachmentId
    );

    // Set appropriate headers for download
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
    res.setHeader('Content-Length', attachment.data.length);
    
    // Send the binary data
    res.send(attachment.data);

  } catch (error) {
    console.error('❌ Download attachment failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message
      });
    }
    
    if (error.statusCode === 404) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Attachment not found'
      });
    }
    
    res.status(500).json({
      error: 'Attachment download failed',
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
  markAsRead,
  listLabels,
  modifyMessageLabels,
  modifyThreadLabels,
  getThread,
  setThreadRead,
  replyToThread,
  getAttachmentMeta,
  previewAttachmentText,
  previewAttachmentTable,
  downloadAttachment
};
