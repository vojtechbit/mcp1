import * as contactsService from '../services/contactsService.js';

/**
 * Contacts Controller
 * Manages contact list stored in Google Sheets
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

    console.log(`🔍 Searching contacts: ${query}`);

    const results = await contactsService.searchContacts(req.user.googleSub, query);

    res.json({
      success: true,
      count: results.length,
      contacts: results
    });

  } catch (error) {
    console.error('❌ Failed to search contacts');
    
    // Special handling for missing sheet
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes'
      });
    }

    res.status(500).json({
      error: 'Contact search failed',
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
    console.log('📋 Listing all contacts');

    const contacts = await contactsService.listAllContacts(req.user.googleSub);

    res.json({
      success: true,
      count: contacts.length,
      contacts: contacts
    });

  } catch (error) {
    console.error('❌ Failed to list contacts');

    // Special handling for missing sheet
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes'
      });
    }

    res.status(500).json({
      error: 'Contact list failed',
      message: error.message
    });
  }
}

/**
 * Add new contact
 * POST /api/contacts
 * Body: { name, email, notes? }
 */
async function addContact(req, res) {
  try {
    const { name, email, notes } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: name, email'
      });
    }

    console.log(`➕ Adding contact: ${name} (${email})`);

    const contact = await contactsService.addContact(req.user.googleSub, {
      name, email, notes
    });

    res.json({
      success: true,
      message: 'Contact added successfully',
      contact: contact
    });

  } catch (error) {
    console.error('❌ Failed to add contact');

    // Special handling for missing sheet
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Type | Notes'
      });
    }

    res.status(500).json({
      error: 'Contact add failed',
      message: error.message
    });
  }
}

export {
  searchContacts,
  listContacts,
  addContact
};
