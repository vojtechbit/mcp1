/**
 * RPC Controller - Unified RPC endpoint dispatcher
 * 
 * Dispatches RPC calls to appropriate service operations
 * based on `op` parameter.
 */

import * as gmailService from '../services/googleApiService.js';
import * as calendarService from '../services/googleApiService.js';
import * as contactsService from '../services/contactsService.js';
import * as tasksService from '../services/tasksService.js';
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
        // FIXED: Better validation for send operation
        if (!params) {
          return res.status(400).json({
            error: 'Invalid request format',
            message: 'params object is required for send operation',
            code: 'INVALID_PARAM',
            details: 'Expected one of:',
            option1: { params: { draftId: 'string' } },
            option2: { params: { to: 'email@example.com', subject: 'string', body: 'string' } }
          });
        }
        
        if (params.draftId) {
          // Send existing draft - VALIDATE draftId format
          if (typeof params.draftId !== 'string' || params.draftId.trim() === '') {
            return res.status(400).json({
              error: 'Invalid draftId format',
              message: 'draftId must be a non-empty string',
              code: 'INVALID_PARAM',
              received: { type: typeof params.draftId, value: params.draftId }
            });
          }
          result = await gmailService.sendDraft(req.user.googleSub, params.draftId);
        } else if (params.to && params.subject && params.body) {
          // Create and send new email - VALIDATE fields
          if (typeof params.to !== 'string' || params.to.trim() === '') {
            return res.status(400).json({
              error: 'Invalid email format',
              message: 'to field must be non-empty email string',
              code: 'INVALID_PARAM'
            });
          }
          if (typeof params.subject !== 'string' || params.subject.trim() === '') {
            return res.status(400).json({
              error: 'Invalid subject format',
              message: 'subject field must be non-empty string',
              code: 'INVALID_PARAM'
            });
          }
          if (typeof params.body !== 'string' || params.body.trim() === '') {
            return res.status(400).json({
              error: 'Invalid body format',
              message: 'body field must be non-empty string',
              code: 'INVALID_PARAM'
            });
          }
          // Create and send new email
          if (params.toSelf && !params.confirmSelfSend) {
            return res.status(400).json({
              error: 'Confirmation required',
              message: 'To send email to yourself, confirmSelfSend must be true',
              code: 'CONFIRM_SELF_SEND_REQUIRED'
            });
          }
          result = await gmailService.sendEmail(req.user.googleSub, params);
        } else {
          return res.status(400).json({
            error: 'Invalid request format',
            message: 'Missing required fields for send operation',
            code: 'INVALID_PARAM',
            details: 'Must provide EITHER draftId OR (to + subject + body)',
            providedFields: Object.keys(params || {})
          });
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
            gmailService.modifyMessageLabels(req.user.googleSub, id, params.actions)
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
        result = await calendarService.listCalendarEvents(req.user.googleSub, params);
        break;
        
      case 'get':
        result = await calendarService.getCalendarEvent(req.user.googleSub, params.eventId);
        break;
        
      case 'create':
        result = await calendarService.createCalendarEvent(req.user.googleSub, params);
        break;
        
      case 'update':
        // FIXED: Validate calendar update structure
        if (!params || !params.eventId) {
          return res.status(400).json({
            error: 'Invalid request format',
            message: 'params.eventId is required for update operation',
            code: 'INVALID_PARAM'
          });
        }
        
        if (!params.updates) {
          return res.status(400).json({
            error: 'Invalid request format',
            message: 'params.updates object is required',
            code: 'INVALID_PARAM'
          });
        }
        
        // Validate start/end structure if present
        if (params.updates.start || params.updates.end) {
          const validateTimeField = (field, fieldName) => {
            if (!field) return null; // Optional
            if (!field.dateTime) {
              return `${fieldName}.dateTime is required (ISO 8601 format, e.g., "2025-10-21T15:00:00")`;
            }
            if (!field.timeZone) {
              return `${fieldName}.timeZone is required (e.g., "Europe/Prague")`;
            }
            return null;
          };
          
          const startError = validateTimeField(params.updates.start, 'start');
          if (startError) {
            return res.status(400).json({
              error: 'Invalid request format',
              message: startError,
              code: 'INVALID_TIME_FORMAT',
              expectedFormat: {
                start: { dateTime: 'ISO8601 string', timeZone: 'string' },
                end: { dateTime: 'ISO8601 string', timeZone: 'string' }
              }
            });
          }
          
          const endError = validateTimeField(params.updates.end, 'end');
          if (endError) {
            return res.status(400).json({
              error: 'Invalid request format',
              message: endError,
              code: 'INVALID_TIME_FORMAT',
              expectedFormat: {
                start: { dateTime: 'ISO8601 string', timeZone: 'string' },
                end: { dateTime: 'ISO8601 string', timeZone: 'string' }
              }
            });
          }
        }
        
        result = await calendarService.updateCalendarEvent(
          req.user.googleSub,
          params.eventId,
          params.updates
        );
        break;
        
      case 'delete':
        result = await calendarService.deleteCalendarEvent(req.user.googleSub, params.eventId);
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
    let { op, params } = req.body;
    
    if (!op) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Missing required field: op',
        code: 'INVALID_PARAM'
      });
    }

    // ✅ FALLBACK: If params not provided, try to extract from root level
    // This handles both:
    // 1. {op: 'add', params: {name, email, ...}}
    // 2. {op: 'add', name, email, ...}
    if (!params) {
      params = {};
      const possibleParamKeys = [
        'email', 'name', 'phone', 'realestate', 'notes',
        'query', 'contacts', 'emails', 'rowIds',
        'eventId', 'updates', 'taskListId', 'taskId'
      ];
      
      for (const key of possibleParamKeys) {
        if (key in req.body && key !== 'op') {
          params[key] = req.body[key];
        }
      }
    }
    
    let result;
    
    switch (op) {
      case 'list':
        result = await contactsService.listAllContacts(req.user.accessToken);
        break;
        
      case 'search':
        if (!params || !params.query) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'search requires params.query',
            code: 'INVALID_PARAM',
            expectedFormat: { op: 'search', params: { query: 'string' } }
          });
        }
        result = await contactsService.searchContacts(req.user.accessToken, params.query);
        break;
        
      case 'add':
        if (!params || !params.email || !params.name) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'add requires params: {name, email, notes?, realEstate?, phone?}',
            code: 'INVALID_PARAM',
            expectedFormat: { op: 'add', params: { name: 'string', email: 'string', notes: 'string?', realEstate: 'string?', phone: 'string?' } }
          });
        }
        result = await contactsService.addContact(req.user.accessToken, params);
        break;
        
      case 'update':
        if (!params || !params.email || !params.name) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'update requires params: {name, email, notes?, realEstate?, phone?}',
            code: 'INVALID_PARAM',
            expectedFormat: { op: 'update', params: { name: 'string', email: 'string', notes: 'string?', realEstate: 'string?', phone: 'string?' } }
          });
        }
        result = await contactsService.updateContact(req.user.accessToken, params);
        break;
        
      case 'delete':
        if (!params || !params.email) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'delete requires params: {email, name?}',
            code: 'INVALID_PARAM',
            expectedFormat: { op: 'delete', params: { email: 'string', name: 'string?' } }
          });
        }
        result = await contactsService.deleteContact(req.user.accessToken, params);
        break;
        
      case 'dedupe':
        result = await contactsService.findDuplicates(req.user.accessToken);
        break;
        
      case 'bulkUpsert':
        if (!params || !params.contacts || !Array.isArray(params.contacts)) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'bulkUpsert requires params: {contacts: [{name, email, notes?, realEstate?, phone?}]}',
            code: 'INVALID_PARAM',
            expectedFormat: { op: 'bulkUpsert', params: { contacts: [{ name: 'string', email: 'string' }] } }
          });
        }
        result = await contactsService.bulkUpsert(req.user.accessToken, params.contacts);
        break;
        
      case 'bulkDelete':
        // TWO MODES for flexibility:
        // 1. emails mode: Pass emails to DELETE ENTIRE CONTACT (all rows with that email)
        // 2. rowIds mode: Pass rowIds to DELETE SPECIFIC ROWS (surgical delete, keep others)
        if (!params || (!params.emails && !params.rowIds)) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'bulkDelete requires params: {emails: [string]} OR {rowIds: [number]}',
            code: 'INVALID_PARAM',
            examples: {
              deleteContact: { op: 'bulkDelete', params: { emails: ['john@example.com'] }, note: 'Deletes ALL rows with this email' },
              deleteDuplicates: { op: 'bulkDelete', params: { rowIds: [3, 5] }, note: 'Deletes only rows 3 and 5, keeps row 2 if same email' }
            }
          });
        }
        result = await contactsService.bulkDelete(req.user.accessToken, {
          emails: params.emails,
          rowIds: params.rowIds
        });
        break;
        
      case 'addressSuggest':
        if (!params || !params.query) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'addressSuggest requires params.query',
            code: 'INVALID_PARAM',
            expectedFormat: { op: 'addressSuggest', params: { query: 'partial name or email' } }
          });
        }
        result = await contactsService.getAddressSuggestions(req.user.accessToken, params.query);
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
        // TODO: tasksService.getTask not exported - needs implementation
        return res.status(501).json({
          error: 'Not implemented',
          message: 'Get single task not yet implemented',
          code: 'NOT_IMPLEMENTED'
        });
        // result = await tasksService.getTask(
        //   req.user.googleSub,
        //   params.taskListId,
        //   params.taskId
        // );
        // break;
        
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
