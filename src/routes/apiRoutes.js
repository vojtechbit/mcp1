import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import * as gmailController from '../controllers/gmailController.js';
import * as calendarController from '../controllers/calendarController.js';
import * as contactsController from '../controllers/contactsController.js';
import * as tasksController from '../controllers/tasksController.js';
import { getAuthStatus } from '../controllers/authStatusController.js';

const router = express.Router();

/**
 * API Routes
 * All routes are protected by verifyToken middleware
 */

// Apply authentication middleware to all API routes
router.use(verifyToken);

// ==================== AUTH STATUS ====================

// Check authentication status
router.get('/auth/status', getAuthStatus);

// ==================== GMAIL ROUTES ====================

// Send email (with send-to-self support)
router.post('/gmail/send', gmailController.sendEmail);

// Reply to email (with send-to-self support)
router.post('/gmail/reply/:messageId', gmailController.replyToEmail);

// Read email (supports ?format=full|metadata|snippet|minimal)
router.get('/gmail/read/:messageId', gmailController.readEmail);

// Batch preview (summary, snippet, or metadata for many IDs)
router.post('/mail/batchPreview', gmailController.batchPreview);

// Batch read (full/minimal reads for many IDs with truncation)
router.post('/mail/batchRead', gmailController.batchRead);

// Get email snippet (fast preview)
router.get('/gmail/snippet/:messageId', gmailController.getEmailSnippet);

// Search emails (with aggregate, include=summary, normalizeQuery, relative time)
router.get('/gmail/search', gmailController.searchEmails);

// Create draft
router.post('/gmail/draft', gmailController.createDraft);

// Delete email (move to trash)
router.delete('/gmail/:messageId', gmailController.deleteEmail);

// Star/unstar email
router.patch('/gmail/:messageId/star', gmailController.toggleStar);

// Mark as read/unread
router.patch('/gmail/:messageId/read', gmailController.markAsRead);

// ==================== CALENDAR ROUTES ====================

// Create event
router.post('/calendar/events', calendarController.createEvent);

// Get specific event
router.get('/calendar/events/:eventId', calendarController.getEvent);

// List events (with pagination and aggregate support)
router.get('/calendar/events', calendarController.listEvents);

// Update event
router.patch('/calendar/events/:eventId', calendarController.updateEvent);

// Delete event
router.delete('/calendar/events/:eventId', calendarController.deleteEvent);

// ==================== CONTACTS ROUTES ====================

// Address suggestions (fuzzy match)
router.get('/contacts/address-suggest', contactsController.getAddressSuggestions);

// Search contacts
router.get('/contacts/search', contactsController.searchContacts);

// List all contacts
router.get('/contacts', contactsController.listContacts);

// Bulk upsert contacts (heavy operation)
router.post('/contacts/bulkUpsert', contactsController.bulkUpsertContacts);

// Bulk delete contacts (heavy operation)
router.post('/contacts/bulkDelete', contactsController.bulkDeleteContacts);

// Add new contact
router.post('/contacts', contactsController.addContact);

// Update contact (by name+email)
router.put('/contacts', contactsController.updateContact);

// Delete contact
router.delete('/contacts', contactsController.deleteContact);

// ==================== TASKS ROUTES ====================

// List all tasks (with pagination and aggregate support)
router.get('/tasks', tasksController.listTasks);

// Create new task
router.post('/tasks', tasksController.createTask);

// Update task (mark as completed, etc.)
router.patch('/tasks/:taskListId/:taskId', tasksController.updateTask);

// Delete task
router.delete('/tasks/:taskListId/:taskId', tasksController.deleteTask);

export default router;
