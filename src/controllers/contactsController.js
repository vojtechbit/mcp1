import * as contactsService from '../services/contactsService.js';
import { heavyLimiter } from '../server.js';
import { computeETag, checkETagMatch, generateSheetUrl } from '../utils/helpers.js';
import { handleControllerError } from '../utils/errors.js';
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';


/**
 * Contacts Controller
 * Manages contact list stored in Google Sheets
 * Structure: Name | Email | Phone | RealEstate | Notes
 */

/**
 * Search contacts
 * GET /api/contacts/search?query=...
 */
async function searchContacts(req, res) {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required parameter: query'
      });
    }

    const { contacts, spreadsheetId } = await contactsService.searchContacts(req.user.accessToken, query);

    // ETag support
    const etag = computeETag(contacts);
    if (checkETagMatch(req.headers['if-none-match'], etag)) {
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.json({
      success: true,
      count: contacts.length,
      contacts,
      sheetUrl: generateSheetUrl(spreadsheetId)
    });

  } catch (error) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Phone | RealEstate | Notes'
      });
    }

    return handleControllerError(res, error, {
      context: 'contacts.searchContacts',
      defaultMessage: 'Contact search failed',
      defaultCode: 'CONTACT_SEARCH_FAILED'
    });
  }
}

/**
 * Get address suggestions (fuzzy match)
 * GET /api/contacts/address-suggest?query=...
 */
async function getAddressSuggestions(req, res) {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required parameter: query'
      });
    }

    const suggestions = await contactsService.getAddressSuggestions(req.user.accessToken, query);

    res.json({
      success: true,
      count: suggestions.length,
      suggestions: suggestions.map(s => ({
        realEstate: s.realEstate,
        // Include score internally but don't emphasize it
        _score: s.score
      }))
    });

  } catch (error) {
    return handleControllerError(res, error, {
      context: 'contacts.getAddressSuggestions',
      defaultMessage: 'Address suggestion failed',
      defaultCode: 'CONTACT_ADDRESS_SUGGEST_FAILED'
    });
  }
}

/**
 * List all contacts
 * GET /api/contacts
 */
async function listContacts(req, res) {
  try {
    const { contacts, spreadsheetId } = await contactsService.listAllContacts(req.user.accessToken);

    // ETag support
    const etag = computeETag(contacts);
    if (checkETagMatch(req.headers['if-none-match'], etag)) {
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.json({
      success: true,
      count: contacts.length,
      contacts,
      hasMore: false, // Contacts always returns all items
      sheetUrl: generateSheetUrl(spreadsheetId)
    });

  } catch (error) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Phone | RealEstate | Notes'
      });
    }

    return handleControllerError(res, error, {
      context: 'contacts.listContacts',
      defaultMessage: 'Contact list failed',
      defaultCode: 'CONTACT_LIST_FAILED'
    });
  }
}

/**
 * Add new contact
 * POST /api/contacts
 * Body: { name, email, phone?, realEstate?, notes? }
 */
async function addContact(req, res) {
  try {
    const { name, email, notes, realEstate, phone } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: name, email'
      });
    }

    const result = await contactsService.addContact(req.user.accessToken, {
      name, email, notes, realEstate, phone
    });

    const response = {
      success: true,
      message: 'Contact added successfully',
      contact: result,
      sheetUrl: generateSheetUrl(result.spreadsheetId)
    };

    // If duplicates exist, inform the assistant
    if (result.duplicates && result.duplicates.length > 0) {
      response.duplicates = result.duplicates;
      response.note = 'Duplicate email(s) detected. Contact was still added. You may want to suggest merging duplicates to the user.';
    }

    res.json(response);

  } catch (error) {
    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Phone | RealEstate | Notes'
      });
    }

    return handleControllerError(res, error, {
      context: 'contacts.addContact',
      defaultMessage: 'Contact add failed',
      defaultCode: 'CONTACT_ADD_FAILED'
    });
  }
}

/**
 * Bulk upsert contacts
 * POST /api/contacts/bulkUpsert
 * Body: { contacts: [{name, email, phone?, realEstate?, notes?}] }
 */
async function bulkUpsertContacts(req, res) {
  // Apply heavy limiter
  heavyLimiter(req, res, async () => {
    try {
      const { contacts } = req.body;

      if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing or invalid field: contacts (must be non-empty array)'
        });
      }

      // Validate each contact
      for (const contact of contacts) {
        if (!contact.name || !contact.email) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Each contact must have name and email'
          });
        }
      }

      const result = await contactsService.bulkUpsert(req.user.accessToken, contacts);

      const response = {
        success: true,
        inserted: result.inserted,
        message: `${result.inserted} contact(s) added successfully`,
        sheetUrl: generateSheetUrl(result.spreadsheetId)
      };

      if (result.duplicates) {
        response.duplicates = result.duplicates;
        response.note = 'Duplicate email(s) detected. Contacts were still added. You may want to suggest merging duplicates to the user.';
      }

      res.json(response);

    } catch (error) {
      return handleControllerError(res, error, {
        context: 'contacts.bulkUpsertContacts',
        defaultMessage: 'Bulk upsert failed',
        defaultCode: 'CONTACT_BULK_UPSERT_FAILED'
      });
    }
  });
}

/**
 * Bulk delete contacts
 * POST /api/contacts/bulkDelete
 * Body: { emails: [string] } OR { rowIds: [number] }
 */
async function bulkDeleteContacts(req, res) {
  // Apply heavy limiter
  heavyLimiter(req, res, async () => {
    try {
      const { emails, rowIds } = req.body;

      if ((!emails || emails.length === 0) && (!rowIds || rowIds.length === 0)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Must provide either emails or rowIds array'
        });
      }

      const result = await contactsService.bulkDelete(req.user.accessToken, { emails, rowIds });

      res.json({
        success: true,
        deleted: result.deleted,
        message: `${result.deleted} contact(s) deleted successfully`,
        sheetUrl: generateSheetUrl(result.spreadsheetId)
      });

    } catch (error) {
      return handleControllerError(res, error, {
        context: 'contacts.bulkDeleteContacts',
        defaultMessage: 'Bulk delete failed',
        defaultCode: 'CONTACT_BULK_DELETE_FAILED'
      });
    }
  });
}

/**
 * Update contact (finds by name+email and updates all fields)
 * PUT /api/contacts
 * Body: { name, email, phone?, realEstate?, notes? }
 */
async function updateContact(req, res) {
  try {
    const { name, email, notes, realEstate, phone } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: name, email'
      });
    }

    const contact = await contactsService.updateContact(req.user.accessToken, {
      name, email, notes, realEstate, phone
    });

    res.json({
      success: true,
      message: 'Contact updated successfully',
      contact,
      sheetUrl: generateSheetUrl(contact.spreadsheetId)
    });

  } catch (error) {
    return handleControllerError(res, error, {
      context: 'contacts.updateContact',
      defaultMessage: 'Contact update failed',
      defaultCode: 'CONTACT_UPDATE_FAILED'
    });
  }
}

/**
 * Delete contact
 * DELETE /api/contacts
 * Accepts identifiers via query string (?email=...) or JSON body ({ email, name })
 */
async function deleteContact(req, res) {
  try {
    const email = typeof req.query?.email === 'string' && req.query.email.trim()
      ? req.query.email.trim()
      : typeof req.body?.email === 'string' && req.body.email.trim()
        ? req.body.email.trim()
        : null;

    const name = typeof req.query?.name === 'string' && req.query.name.trim()
      ? req.query.name.trim()
      : typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim()
        : null;

    if (!email && !name) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required identifier: provide email or name'
      });
    }

    const result = await contactsService.deleteContact(req.user.accessToken, {
      email: email ?? undefined,
      name: name ?? undefined
    });

    res.json({
      success: true,
      message: 'Contact deleted successfully',
      deleted: result.deleted,
      sheetUrl: generateSheetUrl(result.sheet?.spreadsheetId)
    });

  } catch (error) {
    if (error.code === 'CONTACT_NOT_FOUND') {
      return res.status(404).json({
        error: 'Contact not found',
        message: error.message,
        code: 'CONTACT_NOT_FOUND'
      });
    }

    if (error.message?.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Phone | RealEstate | Notes'
      });
    }

    return handleControllerError(res, error, {
      context: 'contacts.deleteContact',
      defaultMessage: 'Contact delete failed',
      defaultCode: 'CONTACT_DELETE_FAILED'
    });
  }
}

const traced = wrapModuleFunctions('controllers.contactsController', {
  searchContacts,
  getAddressSuggestions,
  listContacts,
  addContact,
  bulkUpsertContacts,
  bulkDeleteContacts,
  updateContact,
  deleteContact,
});

const {
  searchContacts: tracedSearchContacts,
  getAddressSuggestions: tracedGetAddressSuggestions,
  listContacts: tracedListContacts,
  addContact: tracedAddContact,
  bulkUpsertContacts: tracedBulkUpsertContacts,
  bulkDeleteContacts: tracedBulkDeleteContacts,
  updateContact: tracedUpdateContact,
  deleteContact: tracedDeleteContact,
} = traced;

export {
  tracedSearchContacts as searchContacts,
  tracedGetAddressSuggestions as getAddressSuggestions,
  tracedListContacts as listContacts,
  tracedAddContact as addContact,
  tracedBulkUpsertContacts as bulkUpsertContacts,
  tracedBulkDeleteContacts as bulkDeleteContacts,
  tracedUpdateContact as updateContact,
  tracedDeleteContact as deleteContact,
};
