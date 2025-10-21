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

export function normalizeRpcRequest(req, res, next) {
  try {
    const { body } = req;
    
    if (!body || !body.op) {
      return next(); // Let controller handle missing op
    }
    
    // List of known params keys for each operation
    const paramKeys = {
      // Mail params
      search: ['query', 'maxResults'],
      send: ['to', 'subject', 'body', 'cc', 'bcc', 'draftId'],
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
      bulkDelete: ['emails', 'rowIds'],
      addressSuggest: ['query'],
      
      // Tasks params
      create: ['title', 'due', 'notes'],
      complete: ['taskListId', 'taskId'],
      reopen: ['taskListId', 'taskId']
    };
    
    const op = body.op;
    const expectedParams = paramKeys[op] || [];
    
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
    
    // CASE 1: Only nested params → already correct format
    if (!hasRootParams && hasNestedParams) {
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
      return next();
    }
    
    // CASE 4: Neither → check if it's a valid no-params operation
    // (like list, dedupe that expect empty params)
    next();
    
  } catch (error) {
    console.error('Normalization error:', error);
    next(); // Pass through to controller for error handling
  }
}
