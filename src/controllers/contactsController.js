import * as contactsService from '../services/contactsService.js';
import { heavyLimiter } from '../server.js';
import { computeETag, checkETagMatch } from '../utils/helpers.js';

/**
 * Contacts Controller
 * Manages contact list stored in Google Sheets
 * Structure: Name | Email | Notes | RealEstate | Phone
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

    const results = await contactsService.searchContacts(req.user.accessToken, query);

    // ETag support
    const etag = computeETag(results);
    if (checkETagMatch(req.headers['if-none-match'], etag)) {
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.json({
      success: true,
      count: results.length,
      contacts: results
    });

  } catch (error) {
    console.error('❌ Failed to search contacts');
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes | RealEstate | Phone'
      });
    }

    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }

    res.status(error.statusCode || 500).json({
      error: 'Contact search failed',
      message: error.message
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
    console.error('❌ Failed to get address suggestions');
    
    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }

    res.status(error.statusCode || 500).json({
      error: 'Address suggestion failed',
      message: error.message
    });
  }
}

/**
 * List all contacts
 * GET /api/contacts
 */
async function listContacts(req, res) {
  try {
    const contacts = await contactsService.listAllContacts(req.user.accessToken);

    // ETag support
    const etag = computeETag(contacts);
    if (checkETagMatch(req.headers['if-none-match'], etag)) {
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.json({
      success: true,
      count: contacts.length,
      contacts: contacts,
      hasMore: false // Contacts always returns all items
    });

  } catch (error) {
    console.error('❌ Failed to list contacts');

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes | RealEstate | Phone'
      });
    }

    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }

    res.status(error.statusCode || 500).json({
      error: 'Contact list failed',
      message: error.message
    });
  }
}

/**
 * Add new contact
 * POST /api/contacts
 * Body: { name, email, notes?, realEstate?, phone? }
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
      contact: result
    };

    // If duplicates exist, inform the assistant
    if (result.duplicates && result.duplicates.length > 0) {
      response.duplicates = result.duplicates;
      response.note = 'Duplicate email(s) detected. Contact was still added. You may want to suggest merging duplicates to the user.';
    }

    res.json(response);

  } catch (error) {
    console.error('❌ Failed to add contact');

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes | RealEstate | Phone'
      });
    }

    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }

    res.status(error.statusCode || 500).json({
      error: 'Contact add failed',
      message: error.message
    });
  }
}

/**
 * Bulk upsert contacts
 * POST /api/contacts/bulkUpsert
 * Body: { contacts: [{name, email, notes?, realEstate?, phone?}] }
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
        message: `${result.inserted} contact(s) added successfully`
      };

      if (result.duplicates) {
        response.duplicates = result.duplicates;
        response.note = 'Duplicate email(s) detected. Contacts were still added. You may want to suggest merging duplicates to the user.';
      }

      res.json(response);

    } catch (error) {
      console.error('❌ Failed to bulk upsert contacts');

      if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Your session has expired. Please log in again.',
          code: 'AUTH_REQUIRED'
        });
      }

      res.status(error.statusCode || 500).json({
        error: 'Bulk upsert failed',
        message: error.message
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
        message: `${result.deleted} contact(s) deleted successfully`
      });

    } catch (error) {
      console.error('❌ Failed to bulk delete contacts');

      if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Your session has expired. Please log in again.',
          code: 'AUTH_REQUIRED'
        });
      }

      res.status(error.statusCode || 500).json({
        error: 'Bulk delete failed',
        message: error.message
      });
    }
  });
}

/**
 * Update contact (finds by name+email and updates all fields)
 * PUT /api/contacts
 * Body: { name, email, notes?, realEstate?, phone? }
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
      contact: contact
    });

  } catch (error) {
    console.error('❌ Failed to update contact');

    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }

    res.status(error.statusCode || 500).json({
      error: 'Contact update failed',
      message: error.message
    });
  }
}

/**
 * Delete contact
 * DELETE /api/contacts
 * Query params: email (required), name (optional)
 */
async function deleteContact(req, res) {
  try {
    const { email, name } = req.query;

    if (!email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required parameter: email'
      });
    }

    const result = await contactsService.deleteContact(req.user.accessToken, {
      email,
      name
    });

    res.json({
      success: true,
      message: 'Contact deleted successfully',
      deleted: result.deleted
    });

  } catch (error) {
    console.error('❌ Failed to delete contact');

    if (error.code === 'CONTACT_NOT_FOUND') {
      return res.status(404).json({
        error: 'Contact not found',
        message: error.message,
        code: 'CONTACT_NOT_FOUND'
      });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes | RealEstate | Phone'
      });
    }

    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }

    res.status(error.statusCode || 500).json({
      error: 'Contact delete failed',
      message: error.message
    });
  }
}

export {
  searchContacts,
  getAddressSuggestions,
  listContacts,
  addContact,
  bulkUpsertContacts,
  bulkDeleteContacts,
  updateContact,
  deleteContact
};
