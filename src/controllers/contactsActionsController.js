/**
 * Contacts Actions Controller - BFF helpers for GPT integrations
 *
 * Provides dedicated mutation endpoints that wrap the contacts service
 * directly instead of going through the generic RPC layer.
 */
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';


import * as contactsService from '../services/contactsService.js';
import { ApiError, handleControllerError, throwValidationError } from '../utils/errors.js';
import { generateSheetUrl } from '../utils/helpers.js';

const overrides = globalThis.__CONTACTS_ACTIONS_TEST_OVERRIDES || {};
const contactsSvc = overrides.contactsService || contactsService;

function pickRealEstate(payload = {}) {
  return payload.realEstate ?? payload.realestate ?? null;
}

async function modifyContact(req, res) {
  try {
    const {
      name,
      email,
      phone,
      notes
    } = req.body || {};
    const realEstate = pickRealEstate(req.body);

    if (!name || !email) {
      throwValidationError({
        code: 'CONTACT_NAME_AND_EMAIL_REQUIRED',
        message: 'Missing required fields: name, email',
        details: { fields: ['name', 'email'] }
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
      message: 'Contact updated successfully',
      sheetUrl: generateSheetUrl(contact.spreadsheetId)
    });

  } catch (error) {
    return handleControllerError(res, error, {
      context: 'contactsActions.modifyContact',
      defaultMessage: 'Contact modify failed',
      defaultCode: 'CONTACT_MODIFY_FAILED'
    });
  }
}

async function deleteContact(req, res) {
  try {
    const { email, name } = req.body || {};

    if (!email && !name) {
      throwValidationError({
        code: 'CONTACT_IDENTIFIER_REQUIRED',
        message: 'At least one of email or name must be provided',
        details: { fields: ['email', 'name'] }
      });
    }

    const result = await contactsSvc.deleteContact(req.user.accessToken, {
      email,
      name
    });

    return res.json({
      ok: true,
      deleted: result.deleted,
      message: 'Contact deleted successfully',
      sheetUrl: generateSheetUrl(result.sheet?.spreadsheetId)
    });

  } catch (error) {
    if (error.code === 'CONTACT_NOT_FOUND') {
      return handleControllerError(
        res,
        new ApiError(error.message || 'Contact not found', {
          statusCode: 404,
          code: 'CONTACT_NOT_FOUND',
          details: {
            email,
            name
          }
        }),
        {
          context: 'contactsActions.deleteContact',
          defaultMessage: 'Contact delete failed'
        }
      );
    }

    if (error.code === 'AMBIGUOUS_DELETE') {
      return handleControllerError(
        res,
        new ApiError(error.message || 'Ambiguous delete', {
          statusCode: 409,
          code: 'AMBIGUOUS_DELETE',
          details: {
            candidates: error.candidates || [],
            email,
            name
          }
        }),
        {
          context: 'contactsActions.deleteContact',
          defaultMessage: 'Contact delete failed'
        }
      );
    }

    return handleControllerError(res, error, {
      context: 'contactsActions.deleteContact',
      defaultMessage: 'Contact delete failed',
      defaultCode: 'CONTACT_DELETE_FAILED'
    });
  }
}

async function bulkDeleteContacts(req, res) {
  try {
    const { emails, rowIds } = req.body || {};

    const hasEmails = Array.isArray(emails) && emails.length > 0;
    const hasRowIds = Array.isArray(rowIds) && rowIds.length > 0;

    if (!hasEmails && !hasRowIds) {
      throwValidationError({
        code: 'CONTACT_BULK_TARGET_REQUIRED',
        message: 'bulkDelete requires emails[] or rowIds[]',
        details: {
          examples: {
            byEmail: { emails: ['john@example.com'] },
            byRowId: { rowIds: [3, 5] }
          }
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
    return handleControllerError(res, error, {
      context: 'contactsActions.bulkDeleteContacts',
      defaultMessage: 'Contact bulkDelete failed',
      defaultCode: 'CONTACT_BULK_DELETE_FAILED'
    });
  }
}

const traced = wrapModuleFunctions('controllers.contactsActionsController', {
  modifyContact,
  deleteContact,
  bulkDeleteContacts,
});

const {
  modifyContact: tracedModifyContact,
  deleteContact: tracedDeleteContact,
  bulkDeleteContacts: tracedBulkDeleteContacts,
} = traced;

export {
  tracedModifyContact as modifyContact,
  tracedDeleteContact as deleteContact,
  tracedBulkDeleteContacts as bulkDeleteContacts,
};
