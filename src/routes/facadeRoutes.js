/**
 * Facade Routes - BFF endpoints for Custom GPT
 * 
 * Provides high-level macros and RPC interface
 * optimized for LLM consumption.
 */

import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { idempotencyMiddleware } from '../middleware/idempotencyMiddleware.js';
import { normalizeRpcRequest } from '../middleware/rpcNormalizer.js';
import * as facadeController from '../controllers/facadeController.js';
import * as rpcController from '../controllers/rpcController.js';
import * as confirmationController from '../controllers/confirmationController.js';
import * as contactsActionsController from '../controllers/contactsActionsController.js';

const router = express.Router();

// Apply authentication middleware to all facade routes
router.use(verifyToken);

// Apply idempotency middleware to mutation routes
router.use(idempotencyMiddleware);

// Apply RPC normalizer GLOBALLY to all routes
// This ensures both formats work: {op, params: {...}} and {op, field1, field2, ...}
router.use(normalizeRpcRequest);

// ==================== MACRO ENDPOINTS ====================

// Inbox Macros
router.post('/macros/inbox/overview', facadeController.macroInboxOverview);
router.post('/macros/inbox/snippets', facadeController.macroInboxSnippets);

// Email Macros
router.post('/macros/email/quickRead', facadeController.macroEmailQuickRead);

// Calendar Macros
router.post('/macros/calendar/plan', facadeController.macroCalendarPlan);
router.post('/macros/calendar/schedule', facadeController.macroCalendarSchedule);
router.post('/macros/calendar/reminderDrafts', facadeController.macroCalendarReminderDrafts);

// Contacts Macros
router.post('/macros/contacts/safeAdd', facadeController.macroContactsSafeAdd);

// Contacts direct actions (mutation shortcuts for GPT)
router.post('/contacts/actions/modify', contactsActionsController.modifyContact);
router.post('/contacts/actions/delete', contactsActionsController.deleteContact);
router.post('/contacts/actions/bulkDelete', contactsActionsController.bulkDeleteContacts);

// Tasks Macros
router.post('/macros/tasks/overview', facadeController.macroTasksOverview);

// ==================== CONFIRMATION ENDPOINTS ====================

// Complete pending confirmation
router.post('/macros/confirm', confirmationController.confirmMacroOperation);

// Preview pending confirmation
router.get('/macros/confirm/:confirmToken', confirmationController.getPendingConfirmationPreview);

// Cancel pending confirmation
router.post('/macros/confirm/:confirmToken/cancel', confirmationController.cancelConfirmation);

// ==================== RPC ENDPOINTS ====================

// Unified RPC endpoints (normalizer applied globally above)
router.post('/rpc/mail', rpcController.mailRpc);
router.post('/rpc/calendar', rpcController.calendarRpc);
router.post('/rpc/contacts', rpcController.contactsRpc);
router.post('/rpc/tasks', rpcController.tasksRpc);

export default router;
