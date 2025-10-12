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

// Check authentication status (for "přihlásit se" requests)
router.get('/auth/status', getAuthStatus);

// ==================== GMAIL ROUTES ====================

// Send email
router.post('/gmail/send', gmailController.sendEmail);

// Read email
router.get('/gmail/read/:messageId', gmailController.readEmail);

// Search emails
router.get('/gmail/search', gmailController.searchEmails);

// Reply to email
router.post('/gmail/reply/:messageId', gmailController.replyToEmail);

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

// List events
router.get('/calendar/events', calendarController.listEvents);

// Update event
router.patch('/calendar/events/:eventId', calendarController.updateEvent);

// Delete event
router.delete('/calendar/events/:eventId', calendarController.deleteEvent);

// ==================== CONTACTS ROUTES ====================

// Search contacts
router.get('/contacts/search', contactsController.searchContacts);

// List all contacts
router.get('/contacts', contactsController.listContacts);

// Add new contact
router.post('/contacts', contactsController.addContact);

// Update contact (by name+email)
router.put('/contacts', contactsController.updateContact);

// ==================== TASKS ROUTES ====================

// List all tasks
router.get('/tasks', tasksController.listTasks);

// Create new task
router.post('/tasks', tasksController.createTask);

// Update task (mark as completed, etc.)
router.patch('/tasks/:taskListId/:taskId', tasksController.updateTask);

// Delete task
router.delete('/tasks/:taskListId/:taskId', tasksController.deleteTask);

export default router;
