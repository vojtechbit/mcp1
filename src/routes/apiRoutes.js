import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { idempotencyMiddleware } from '../middleware/idempotencyMiddleware.js';
import * as gmailController from '../controllers/gmailController.js';
import * as calendarController from '../controllers/calendarController.js';
import * as contactsController from '../controllers/contactsController.js';
import * as tasksController from '../controllers/tasksController.js';
import { getAuthStatus } from '../controllers/authStatusController.js';

const router = express.Router();

// Apply authentication middleware to all API routes
router.use(verifyToken);

// Apply idempotency middleware to mutation routes
router.use(idempotencyMiddleware);

// ==================== AUTH STATUS ====================

router.get('/auth/status', getAuthStatus);

// ==================== GMAIL ROUTES ====================

// Send email
router.post('/gmail/send', gmailController.sendEmail);

// Reply to email
router.post('/gmail/reply/:messageId', gmailController.replyToEmail);

// Read email
router.get('/gmail/read/:messageId', gmailController.readEmail);

// Batch operations
router.post('/mail/batchPreview', gmailController.batchPreview);
router.post('/mail/batchRead', gmailController.batchRead);

// Get email snippet
router.get('/gmail/snippet/:messageId', gmailController.getEmailSnippet);

// Search emails
router.get('/gmail/search', gmailController.searchEmails);

// List follow-up candidates
router.get('/gmail/followups', gmailController.listFollowupCandidates);

// Create draft
router.post('/gmail/draft', gmailController.createDraft);

// Delete email
router.delete('/gmail/:messageId', gmailController.deleteEmail);

// Star/unstar email
router.patch('/gmail/:messageId/star', gmailController.toggleStar);

// Mark as read/unread
router.patch('/gmail/:messageId/read', gmailController.markAsRead);

// ==================== NEW: LABELS ====================

// List all labels
router.get('/gmail/labels', gmailController.listLabels);

// Modify message labels
router.patch('/gmail/:messageId/labels', gmailController.modifyMessageLabels);

// Modify thread labels
router.patch('/gmail/threads/:threadId/labels', gmailController.modifyThreadLabels);

// ==================== NEW: THREADS ====================

// Get thread summary
router.get('/gmail/threads/:threadId', gmailController.getThread);

// Mark thread as read/unread
router.patch('/gmail/threads/:threadId/read', gmailController.setThreadRead);

// Reply to thread
router.post('/gmail/threads/:threadId/reply', gmailController.replyToThread);

// ==================== NEW: ATTACHMENTS ====================

// Get attachment metadata
router.get('/gmail/attachments/:messageId/:attachmentId', gmailController.getAttachmentMeta);

// Preview attachment text
router.get('/gmail/attachments/:messageId/:attachmentId/text', gmailController.previewAttachmentText);

// Preview attachment table
router.get('/gmail/attachments/:messageId/:attachmentId/table', gmailController.previewAttachmentTable);

// Download attachment (signed URL)
router.get('/gmail/attachments/:messageId/:attachmentId/download', gmailController.downloadAttachment);

// ==================== CALENDAR ROUTES ====================

router.post('/calendar/events', calendarController.createEvent);
router.get('/calendar/events/:eventId', calendarController.getEvent);
router.get('/calendar/events', calendarController.listEvents);
router.patch('/calendar/events/:eventId', calendarController.updateEvent);
router.delete('/calendar/events/:eventId', calendarController.deleteEvent);

// ==================== CONTACTS ROUTES ====================

router.get('/contacts/address-suggest', contactsController.getAddressSuggestions);
router.get('/contacts/search', contactsController.searchContacts);
router.get('/contacts', contactsController.listContacts);
router.post('/contacts/bulkUpsert', contactsController.bulkUpsertContacts);
router.post('/contacts/bulkDelete', contactsController.bulkDeleteContacts);
router.post('/contacts', contactsController.addContact);
router.put('/contacts', contactsController.updateContact);
router.delete('/contacts', contactsController.deleteContact);

// ==================== TASKS ROUTES ====================

router.get('/tasks', tasksController.listTasks);
router.post('/tasks', tasksController.createTask);
router.patch('/tasks/:taskListId/:taskId', tasksController.updateTask);
router.delete('/tasks/:taskListId/:taskId', tasksController.deleteTask);

export default router;
