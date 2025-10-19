/**
 * RPC Controller - Unified RPC endpoint dispatcher
 * 
 * Dispatches RPC calls to appropriate service operations
 * based on `op` parameter.
 */

import * as gmailService from '../services/googleApiService.js';
import * as calendarService from '../services/googleApiService.js';
import * as contactsService from '../services/googleApiService.js';
import * as tasksService from '../services/googleApiService.js';
import { computeETag } from '../utils/helpers.js';

// ==================== MAIL RPC ====================

export async function mailRpc(req, res) {
  try {
    const { op, params } = req.body;
    
    if (!op) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Missing required field: op',
        code: 'INVALID_PARAM'
      });
    }
    
    let result;
    
    switch (op) {
      case 'search':
        result = await gmailService.searchEmails(req.user.googleSub, params);
        break;
        
      case 'preview':
        result = await Promise.all(
          (params.ids || []).map(id => 
            gmailService.readEmail(req.user.googleSub, id, 'metadata')
          )
        );
        break;
        
      case 'read':
        if (params.ids && params.ids.length > 1) {
          result = await Promise.all(
            params.ids.map(id => 
              gmailService.readEmail(req.user.googleSub, id, params.format || 'full')
            )
          );
        } else if (params.ids && params.ids.length === 1) {
          result = await gmailService.readEmail(
            req.user.googleSub, 
            params.ids[0], 
            params.format || 'full'
          );
        } else if (params.searchQuery) {
          const searchResult = await gmailService.searchEmails(req.user.googleSub, {
            q: params.searchQuery,
            maxResults: 10
          });
          result = await Promise.all(
            searchResult.messages.map(m => 
              gmailService.readEmail(req.user.googleSub, m.id, params.format || 'full')
            )
          );
        }
        break;
        
      case 'send':
        if (params.draftId) {
          // Send existing draft
          result = await gmailService.sendDraft(req.user.googleSub, params.draftId);
        } else {
          // Create and send new email
          if (params.toSelf && !params.confirmSelfSend) {
            return res.status(400).json({
              error: 'Confirmation required',
              message: 'To send email to yourself, confirmSelfSend must be true',
              code: 'CONFIRM_SELF_SEND_REQUIRED'
            });
          }
          result = await gmailService.sendEmail(req.user.googleSub, params);
        }
        break;
        
      case 'reply':
        result = await gmailService.replyToEmail(
          req.user.googleSub, 
          params.messageId, 
          params
        );
        break;
        
      case 'modify':
        result = await Promise.all(
          (params.ids || []).map(id =>
            gmailService.modifyMessage(req.user.googleSub, id, params.actions)
          )
        );
        break;
        
      case 'attachmentPreview':
        if (params.mode === 'text') {
          result = await gmailService.previewAttachmentText(
            req.user.googleSub,
            params.messageId,
            params.attachmentId,
            params.maxKb || 256
          );
        } else if (params.mode === 'table') {
          result = await gmailService.previewAttachmentTable(
            req.user.googleSub,
            params.messageId,
            params.attachmentId,
            {
              maxRows: Math.min(params.maxRows || 200, 200),
              delimiter: params.delimiter || 'auto'
            }
          );
        }
        break;
        
      case 'labels':
        if (params.list) {
          result = await gmailService.listLabels(req.user.googleSub);
        } else if (params.modify) {
          result = await gmailService.modifyMessageLabels(
            req.user.googleSub,
            params.modify.messageId || params.modify.ids?.[0],
            {
              add: params.modify.add,
              remove: params.modify.remove
            }
          );
        }
        break;
        
      default:
        return res.status(400).json({
          error: 'Bad request',
          message: `Unknown operation: ${op}`,
          code: 'INVALID_PARAM'
        });
    }
    
    res.json({
      ok: true,
      data: result
    });
    
  } catch (error) {
    console.error('❌ Mail RPC failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'REAUTH_REQUIRED'
      });
    }
    
    if (error.statusCode === 451) {
      return res.status(451).json({
        error: 'Attachment blocked',
        message: error.message,
        code: 'ATTACHMENT_BLOCKED'
      });
    }
    
    res.status(500).json({
      ok: false,
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
}

// ==================== CALENDAR RPC ====================

export async function calendarRpc(req, res) {
  try {
    const { op, params } = req.body;
    
    if (!op) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Missing required field: op',
        code: 'INVALID_PARAM'
      });
    }
    
    let result;
    
    switch (op) {
      case 'list':
        result = await calendarService.listEvents(req.user.googleSub, params);
        break;
        
      case 'get':
        result = await calendarService.getEvent(req.user.googleSub, params.eventId);
        break;
        
      case 'create':
        result = await calendarService.createEvent(req.user.googleSub, params);
        break;
        
      case 'update':
        result = await calendarService.updateEvent(
          req.user.googleSub,
          params.eventId,
          params.updates
        );
        break;
        
      case 'delete':
        result = await calendarService.deleteEvent(req.user.googleSub, params.eventId);
        break;
        
      case 'checkConflicts':
        if (!params.start || !params.end) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'Missing required fields: start, end',
            code: 'INVALID_PARAM'
          });
        }
        result = await calendarService.checkConflicts(req.user.googleSub, {
          start: params.start,
          end: params.end,
          excludeEventId: params.excludeEventId
        });
        break;
        
      default:
        return res.status(400).json({
          error: 'Bad request',
          message: `Unknown operation: ${op}`,
          code: 'INVALID_PARAM'
        });
    }
    
    res.json({
      ok: true,
      data: result
    });
    
  } catch (error) {
    console.error('❌ Calendar RPC failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'REAUTH_REQUIRED'
      });
    }
    
    if (error.statusCode === 409) {
      return res.status(409).json({
        error: 'Conflict',
        message: error.message,
        code: 'CONFLICT',
        alternatives: error.alternatives || []
      });
    }
    
    res.status(500).json({
      ok: false,
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
}

// ==================== CONTACTS RPC ====================

export async function contactsRpc(req, res) {
  try {
    const { op, params } = req.body;
    
    if (!op) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Missing required field: op',
        code: 'INVALID_PARAM'
      });
    }
    
    let result;
    
    switch (op) {
      case 'list':
        result = await contactsService.listContacts(req.user.googleSub, params);
        break;
        
      case 'search':
        result = await contactsService.searchContacts(req.user.googleSub, params.query);
        break;
        
      case 'add':
        result = await contactsService.addContact(req.user.googleSub, params);
        break;
        
      case 'update':
        result = await contactsService.updateContact(
          req.user.googleSub,
          params.contactId,
          params.updates
        );
        break;
        
      case 'delete':
        result = await contactsService.deleteContact(req.user.googleSub, params.contactId);
        break;
        
      case 'dedupe':
        // TODO: Implement deduplication
        result = { duplicates: [] };
        break;
        
      case 'bulkUpsert':
        result = await contactsService.bulkUpsertContacts(req.user.googleSub, params.entries);
        break;
        
      default:
        return res.status(400).json({
          error: 'Bad request',
          message: `Unknown operation: ${op}`,
          code: 'INVALID_PARAM'
        });
    }
    
    res.json({
      ok: true,
      data: result
    });
    
  } catch (error) {
    console.error('❌ Contacts RPC failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'REAUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      ok: false,
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
}

// ==================== TASKS RPC ====================

export async function tasksRpc(req, res) {
  try {
    const { op, params } = req.body;
    
    if (!op) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Missing required field: op',
        code: 'INVALID_PARAM'
      });
    }
    
    let result;
    
    switch (op) {
      case 'list':
        result = await tasksService.listTasks(req.user.googleSub, params);
        break;
        
      case 'get':
        result = await tasksService.getTask(
          req.user.googleSub,
          params.taskListId,
          params.taskId
        );
        break;
        
      case 'create':
        result = await tasksService.createTask(req.user.googleSub, params);
        break;
        
      case 'update':
        result = await tasksService.updateTask(
          req.user.googleSub,
          params.taskListId,
          params.taskId,
          params.updates
        );
        break;
        
      case 'delete':
        result = await tasksService.deleteTask(
          req.user.googleSub,
          params.taskListId,
          params.taskId
        );
        break;
        
      case 'complete':
        result = await tasksService.updateTask(
          req.user.googleSub,
          params.taskListId,
          params.taskId,
          { status: 'completed' }
        );
        break;
        
      case 'reopen':
        result = await tasksService.updateTask(
          req.user.googleSub,
          params.taskListId,
          params.taskId,
          { status: 'needsAction' }
        );
        break;
        
      default:
        return res.status(400).json({
          error: 'Bad request',
          message: `Unknown operation: ${op}`,
          code: 'INVALID_PARAM'
        });
    }
    
    res.json({
      ok: true,
      data: result
    });
    
  } catch (error) {
    console.error('❌ Tasks RPC failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'REAUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      ok: false,
      error: error.message,
      code: 'SERVER_ERROR'
    });
  }
}
