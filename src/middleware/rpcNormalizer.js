/**
 * RPC Request Normalizer Middleware
 * 
 * Transforms requests from multiple formats into unified internal format.
 * Handles:
 * - Root-level params: {op, email, name} → {op, params: {email, name}}
 * - Nested params: {op, params: {email}} → stays as is
 * - Mixed: Merges both levels into params
 * 
 * This makes backend tolerant of both ChatGPT schema formats.
 */
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';


function normalizeRpcRequest(req, res, next) {
  try {
    const { body } = req;
    
    if (!body || !body.op) {
      console.log('[RPC-NORM] No body or op provided');
      return next(); // Let controller handle missing op
    }
    
    // ✅ Debug: Log incoming request
    console.log(`[RPC-NORM] Incoming: op=${body.op}, keys=${Object.keys(body).join(', ')}`);
    
    // List of known params keys for each operation
    const paramKeys = {
      // Mail params
      search: ['query', 'maxResults'],
      send: ['to', 'subject', 'body', 'cc', 'bcc', 'draftId', 'confirmSelfSend', 'toSelf'],
      createDraft: ['to', 'subject', 'body', 'cc', 'bcc', 'threadId'],
      updateDraft: ['draftId', 'to', 'subject', 'body', 'cc', 'bcc', 'threadId'],
      listDrafts: ['maxResults', 'pageToken'],
      getDraft: ['draftId', 'format'],
      read: ['ids', 'searchQuery', 'format'],
      reply: ['messageId'],
      modify: ['ids', 'actions'],
      
      // Calendar params
      list: ['timeMin', 'timeMax'],
      get: ['eventId'],
      create: ['title', 'when', 'attendees', 'location', 'notes', 'conference', 'reminders'],
      update: ['eventId', 'updates', 'start', 'end', 'summary'],
      delete: ['eventId'],
      checkConflicts: ['start', 'end', 'excludeEventId'],
      
      // Contacts params
      add: ['name', 'email', 'phone', 'realestate', 'notes'],
      update: ['name', 'email', 'phone', 'realestate', 'notes'],
      search: ['query'],
      dedupe: [],
      bulkUpsert: ['contacts'],
      bulkDelete: ['emails', 'rowIds'],  // ✅ FIXED: Now explicitly lists both modes
      addressSuggest: ['query'],
      
      // Tasks params
      create: ['title', 'due', 'notes'],
      complete: ['taskListId', 'taskId'],
      reopen: ['taskListId', 'taskId']
    };
    
    const op = body.op;
    const expectedParams = paramKeys[op] || [];
    
    // Debug: Log what we're processing
    if (Object.keys(body).length > 1) { // More than just 'op'
      const nonOpKeys = Object.keys(body).filter(k => k !== 'op');
      console.log(`[RPC-NORM] Non-op keys: ${nonOpKeys.join(', ')}`);
    }
    
    // Check what format we received
    let hasRootParams = false;
    let hasNestedParams = !!body.params;
    
    // Detect if there are root-level param keys
    for (const key of expectedParams) {
      if (key in body && key !== 'op') {
        hasRootParams = true;
        break;
      }
    }
    
    // ✅ FIXED: Special handling for bulkDelete which can come in multiple formats
    if (op === 'bulkDelete') {
      // Already in params? OK
      if (body.params && (body.params.emails || body.params.rowIds)) {
        console.log('[RPC-NORM] bulkDelete: Already in correct format with params');
        return next();
      }
      // Have root-level params? Wrap them
      if (body.emails || body.rowIds) {
        req.body = {
          op: body.op,
          params: {
            emails: body.emails,
            rowIds: body.rowIds
          }
        };
        console.log('[RPC-NORM] bulkDelete: Wrapped root-level params into params object');
        return next();
      }
      // Invalid format - let controller handle the error
      console.log('[RPC-NORM] bulkDelete: Invalid format (no emails or rowIds)');
      return next();
    }
    
    // CASE 1: Only nested params → already correct format
    if (!hasRootParams && hasNestedParams) {
      console.log(`[RPC-NORM] ${op}: Only nested params - correct format`);
      return next();
    }
    
    // CASE 2: Only root-level params → wrap them
    if (hasRootParams && !hasNestedParams) {
      const params = {};
      for (const key of expectedParams) {
        if (key in body) {
          params[key] = body[key];
        }
      }
      // Keep op at root, move others to params
      req.body = {
        op: body.op,
        params: params
      };
      console.log(`[RPC-NORM] ${op}: Wrapped root-level params into params object`);
      return next();
    }
    
    // CASE 3: Both root and nested → merge (root takes precedence)
    if (hasRootParams && hasNestedParams) {
      const merged = { ...body.params };
      for (const key of expectedParams) {
        if (key in body) {
          merged[key] = body[key];
        }
      }
      req.body = {
        op: body.op,
        params: merged
      };
      console.log(`[RPC-NORM] ${op}: Merged root-level and nested params`);
      return next();
    }
    
    // CASE 4: Neither → check if it's a valid no-params operation
    // (like list, dedupe that expect empty params)
    console.log(`[RPC-NORM] ${op}: No params found - let controller handle`);
    next();
    
  } catch (error) {
    console.error('[RPC-NORM] ❌ Normalization error:', error.message);
    next(); // Pass through to controller for error handling
  }
}

const traced = wrapModuleFunctions('middleware.rpcNormalizer', {
  normalizeRpcRequest,
});

const {
  normalizeRpcRequest: tracedNormalizeRpcRequest,
} = traced;

export {
  tracedNormalizeRpcRequest as normalizeRpcRequest,
};
