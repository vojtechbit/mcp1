/**
 * Contacts Normalizer Middleware
 * 
 * Transforms any RPC/custom format contact request to Sheets-compatible format.
 * Ensures all contact operations (add, delete, etc.) go through Sheets, not MongoDB.
 */
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';


function normalizeContactsRequest(req, res, next) {
  // Only process /rpc/contacts endpoints
  if (!req.path.includes('/rpc/contacts') && req.method !== 'POST') {
    return next();
  }

  try {
    const { op, params } = req.body;

    if (!op) {
      return next(); // Let controller handle error
    }

    // Normalize params structure for Sheets operations
    let normalizedParams = params || {};

    // Extract params from root level if not nested
    if (!params) {
      normalizedParams = {};
      const possibleKeys = ['email', 'name', 'phone', 'realestate', 'notes', 'query', 'contacts', 'emails', 'rowIds'];
      
      for (const key of possibleKeys) {
        if (key in req.body && key !== 'op') {
          normalizedParams[key] = req.body[key];
        }
      }
    }

    // Map operation to Sheets-compatible format
    switch (op) {
      case 'add':
      case 'update':
        // Ensure name/email are present and properly formatted
        if (normalizedParams.name && normalizedParams.email) {
          normalizedParams.name = String(normalizedParams.name).trim();
          normalizedParams.email = String(normalizedParams.email).trim();
          normalizedParams.notes = normalizedParams.notes ? String(normalizedParams.notes).trim() : '';
          normalizedParams.realEstate = normalizedParams.realEstate || normalizedParams.realestate ? String(normalizedParams.realEstate || normalizedParams.realestate).trim() : '';
          normalizedParams.phone = normalizedParams.phone ? String(normalizedParams.phone).trim() : '';
        }
        break;

      case 'delete':
        if (normalizedParams.email) {
          normalizedParams.email = String(normalizedParams.email).trim();
        }
        break;

      case 'bulkUpsert':
        if (Array.isArray(normalizedParams.contacts)) {
          normalizedParams.contacts = normalizedParams.contacts.map(c => ({
            name: String(c.name).trim(),
            email: String(c.email).trim(),
            notes: c.notes ? String(c.notes).trim() : '',
            realEstate: c.realEstate || c.realestate ? String(c.realEstate || c.realestate).trim() : '',
            phone: c.phone ? String(c.phone).trim() : ''
          }));
        }
        break;

      case 'bulkDelete':
        if (Array.isArray(normalizedParams.emails)) {
          normalizedParams.emails = normalizedParams.emails.map(e => String(e).trim());
        }
        if (Array.isArray(normalizedParams.rowIds)) {
          normalizedParams.rowIds = normalizedParams.rowIds.map(id => Number(id));
        }
        break;

      case 'search':
      case 'addressSuggest':
        if (normalizedParams.query) {
          normalizedParams.query = String(normalizedParams.query).trim();
        }
        break;
    }

    // Update request body with normalized params
    req.body = {
      op,
      params: normalizedParams
    };

    next();

  } catch (error) {
    console.error('[NORMALIZER] Error normalizing contacts request:', error.message);
    res.status(400).json({
      error: 'Bad request format',
      message: error.message,
      code: 'INVALID_PARAM'
    });
  }
}

const traced = wrapModuleFunctions('middleware.contactsNormalizer', {
  normalizeContactsRequest,
});

const {
  normalizeContactsRequest: tracedNormalizeContactsRequest,
} = traced;

export {
  tracedNormalizeContactsRequest as normalizeContactsRequest,
};
