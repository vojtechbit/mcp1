import * as contactsService from '../services/contactsService.js';

/**
 * Contacts Controller
 * Manages contact list stored in Google Sheets
 * 
 * NEW: Supports Property and Phone fields + DELETE functionality
 */

/**
 * Search contacts
 * GET /api/contacts/search?query=...
 * NEW: Can also filter by property
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
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes | Property | Phone'
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
 * NEW: Returns property and phone fields
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
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes | Property | Phone'
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
 * Body: { name, email, notes?, property?, phone? }
 * NEW: Supports property and phone fields
 */
async function addContact(req, res) {
  try {
    const { name, email, notes, property, phone } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: name, email'
      });
    }

    console.log(`➕ Adding contact: ${name} (${email})`);
    if (notes) console.log(`   Notes: ${notes}`);
    if (property) console.log(`   Property: ${property}`);
    if (phone) console.log(`   Phone: ${phone}`);

    const contact = await contactsService.addContact(req.user.googleSub, {
      name, email, notes, property, phone
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
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes | Property | Phone'
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
 * Update contact (finds by name+email and updates all fields)
 * PUT /api/contacts
 * Body: { name, email, notes?, property?, phone? }
 * NEW: Supports property and phone fields
 */
async function updateContact(req, res) {
  try {
    const { name, email, notes, property, phone } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: name, email'
      });
    }

    console.log(`✏️  Updating contact: ${name} (${email})`);
    if (notes) console.log(`   Notes: ${notes}`);
    if (property) console.log(`   Property: ${property}`);
    if (phone) console.log(`   Phone: ${phone}`);

    const contact = await contactsService.updateContact(req.user.googleSub, {
      name, email, notes, property, phone
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

/**
 * Delete contact
 * DELETE /api/contacts
 * Query params: email (required), name (optional)
 * Example: DELETE /api/contacts?email=john@example.com
 * Example: DELETE /api/contacts?email=john@example.com&name=John Doe
 * 
 * NEW FUNCTION
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

    console.log(`🗑️  Deleting contact: ${name ? `${name} (${email})` : email}`);

    const result = await contactsService.deleteContact(req.user.googleSub, {
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
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.response?.status,
      data: error.response?.data
    });

    // Special handling for contact not found
    if (error.code === 'CONTACT_NOT_FOUND') {
      return res.status(404).json({
        error: 'Contact not found',
        message: error.message,
        code: 'CONTACT_NOT_FOUND'
      });
    }

    // Special handling for missing sheet
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Contact sheet not found',
        message: error.message,
        instructions: 'Please create a Google Sheet named "MCP1 Contacts" with columns: Name | Email | Notes | Property | Phone'
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
      error: 'Contact delete failed',
      message: error.message
    });
  }
}

export {
  searchContacts,
  listContacts,
  addContact,
  updateContact,
  deleteContact  // NEW EXPORT
};
