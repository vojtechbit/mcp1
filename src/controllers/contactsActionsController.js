/**
 * Contacts Actions Controller - BFF helpers for GPT integrations
 *
 * Provides dedicated mutation endpoints that wrap the contacts service
 * directly instead of going through the generic RPC layer.
 */

import * as contactsService from '../services/contactsService.js';

const overrides = globalThis.__CONTACTS_ACTIONS_TEST_OVERRIDES || {};
const contactsSvc = overrides.contactsService || contactsService;

function pickRealEstate(payload = {}) {
  return payload.realEstate ?? payload.realestate ?? null;
}

export async function modifyContact(req, res) {
  try {
    const {
      name,
      email,
      phone,
      notes
    } = req.body || {};
    const realEstate = pickRealEstate(req.body);

    if (!name || !email) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Missing required fields: name, email',
        code: 'INVALID_PARAM'
      });
    }

    const contact = await contactsSvc.updateContact(req.user.accessToken, {
      name,
      email,
      phone,
      notes,
      realEstate
    });

    return res.json({
      ok: true,
      contact,
      message: 'Contact updated successfully'
    });

  } catch (error) {
    console.error('❌ Contacts modify failed:', error.message);

    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }

    return res.status(error.statusCode || 500).json({
      error: 'Contact modify failed',
      message: error.message
    });
  }
}

export async function deleteContact(req, res) {
  try {
    const { email, name } = req.body || {};

    if (!email && !name) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'At least one of email or name must be provided',
        code: 'INVALID_PARAM'
      });
    }

    const result = await contactsSvc.deleteContact(req.user.accessToken, {
      email,
      name
    });

    return res.json({
      ok: true,
      deleted: result.deleted,
      message: 'Contact deleted successfully'
    });

  } catch (error) {
    console.error('❌ Contacts delete failed:', error.message);

    if (error.code === 'CONTACT_NOT_FOUND') {
      return res.status(404).json({
        error: 'Contact not found',
        message: error.message,
        code: 'CONTACT_NOT_FOUND'
      });
    }

    if (error.code === 'AMBIGUOUS_DELETE') {
      return res.status(409).json({
        error: 'Ambiguous delete',
        message: error.message,
        code: 'AMBIGUOUS_DELETE',
        candidates: error.candidates || []
      });
    }

    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }

    if (error.statusCode === 404) {
      return res.status(404).json({
        error: 'Contact delete failed',
        message: error.message
      });
    }

    return res.status(error.statusCode || 500).json({
      error: 'Contact delete failed',
      message: error.message
    });
  }
}

export async function bulkDeleteContacts(req, res) {
  try {
    const { emails, rowIds } = req.body || {};

    const hasEmails = Array.isArray(emails) && emails.length > 0;
    const hasRowIds = Array.isArray(rowIds) && rowIds.length > 0;

    if (!hasEmails && !hasRowIds) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'bulkDelete requires emails[] or rowIds[]',
        code: 'INVALID_PARAM',
        examples: {
          byEmail: { emails: ['john@example.com'] },
          byRowId: { rowIds: [3, 5] }
        }
      });
    }

    const result = await contactsSvc.bulkDelete(req.user.accessToken, {
      emails: hasEmails ? emails : undefined,
      rowIds: hasRowIds ? rowIds : undefined
    });

    return res.json({
      ok: true,
      deleted: result.deleted,
      mode: hasEmails ? 'emails' : 'rowIds'
    });

  } catch (error) {
    console.error('❌ Contacts bulkDelete failed:', error.message);

    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }

    return res.status(error.statusCode || 500).json({
      error: 'Contact bulkDelete failed',
      message: error.message
    });
  }
}
