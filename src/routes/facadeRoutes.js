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

const router = express.Router();

// Apply authentication middleware to all facade routes
router.use(verifyToken);

// Apply idempotency middleware to mutation routes
router.use(idempotencyMiddleware);

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

// Apply normalizer BEFORE RPC controllers
// This transforms requests from multiple formats into unified internal format

// Unified RPC endpoints with normalization
router.post('/rpc/mail', normalizeRpcRequest, rpcController.mailRpc);
router.post('/rpc/calendar', normalizeRpcRequest, rpcController.calendarRpc);
router.post('/rpc/contacts', normalizeRpcRequest, rpcController.contactsRpc);
router.post('/rpc/tasks', normalizeRpcRequest, rpcController.tasksRpc);

export default router;
