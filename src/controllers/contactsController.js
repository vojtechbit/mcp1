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
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.response?.status,
      data: error.response?.data
    });
    
    // Special handling for missing sheet
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes'
      });
    }

    // Check if it's an auth error
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
 * List all contacts
 * GET /api/contacts
 */
async function listContacts(req, res) {
  try {
    console.log('📋 Listing all contacts...');

    const contacts = await contactsService.listAllContacts(req.user.googleSub);

    res.json({
      success: true,
      count: contacts.length,
      contacts: contacts
    });

  } catch (error) {
    console.error('❌ Failed to list contacts');
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.response?.status,
      data: error.response?.data
    });

    // Special handling for missing sheet
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes'
      });
    }

    // Check if it's an auth error
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
    if (notes) console.log(`   Notes: ${notes}`);

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
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.response?.status,
      data: error.response?.data
    });

    // Special handling for duplicate contact
    if (error.code === 'CONTACT_EXISTS') {
      return res.status(409).json({
        error: 'Contact already exists',
        message: error.message,
        code: 'CONTACT_EXISTS',
        existingContact: error.existingContact,
        suggestion: 'Use the update contact endpoint to modify the existing contact, or provide a different email address.'
      });
    }

    // Special handling for missing sheet
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes'
      });
    }

    // Check if it's an auth error
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
 * Update contact (finds by name+email and updates notes)
 * PUT /api/contacts
 * Body: { name, email, notes }
 */
async function updateContact(req, res) {
  try {
    const { name, email, notes } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: name, email'
      });
    }

    console.log(`✏️  Updating contact: ${name} (${email})`);
    if (notes) console.log(`   New notes: ${notes}`);

    const contact = await contactsService.updateContact(req.user.googleSub, {
      name, email, notes
    });

    res.json({
      success: true,
      message: 'Contact updated successfully',
      contact: contact
    });

  } catch (error) {
    console.error('❌ Failed to update contact');
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.response?.status,
      data: error.response?.data
    });

    // Check if it's an auth error
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

export {
  searchContacts,
  listContacts,
  addContact,
  updateContact
};
