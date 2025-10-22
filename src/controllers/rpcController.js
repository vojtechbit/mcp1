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

const rpcTestOverrides = globalThis.__RPC_TEST_OVERRIDES || {};
const gmailSvc = rpcTestOverrides.gmailService || gmailService;
const contactsSvc = rpcTestOverrides.contactsService || contactsService;
const tasksSvc = rpcTestOverrides.tasksService || tasksService;

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
        result = await gmailSvc.searchEmails(req.user.googleSub, params);
        break;
        
      case 'preview':
        result = await Promise.all(
          (params.ids || []).map(id =>
            gmailSvc.readEmail(req.user.googleSub, id, 'metadata')
          )
        );
        break;
        
      case 'read':
        if (params.ids && params.ids.length > 1) {
          result = await Promise.all(
            params.ids.map(id =>
              gmailSvc.readEmail(req.user.googleSub, id, params.format || 'full')
            )
          );
        } else if (params.ids && params.ids.length === 1) {
          result = await gmailSvc.readEmail(
            req.user.googleSub,
            params.ids[0],
            params.format || 'full'
          );
        } else if (params.searchQuery) {
          const searchResult = await gmailSvc.searchEmails(req.user.googleSub, {
            q: params.searchQuery,
            maxResults: 10
          });
          result = await Promise.all(
            searchResult.messages.map(m =>
              gmailSvc.readEmail(req.user.googleSub, m.id, params.format || 'full')
            )
          );
        }
        break;

      case 'createDraft':
        if (!params || typeof params !== 'object') {
          return res.status(400).json({
            error: 'Invalid request format',
            message: 'params object is required for createDraft operation',
            code: 'INVALID_PARAM',
            expectedFormat: { op: 'createDraft', params: { to: 'string', subject: 'string', body: 'string' } }
          });
        }

        const missingDraftFields = ['to', 'subject', 'body'].filter(field => {
          const value = params[field];
          return typeof value !== 'string' || value.trim() === '';
        });

        if (missingDraftFields.length > 0) {
          return res.status(400).json({
            error: 'Invalid request format',
            message: `Missing or invalid field(s) for createDraft: ${missingDraftFields.join(', ')}`,
            code: 'INVALID_PARAM',
            expectedFormat: { op: 'createDraft', params: { to: 'recipient@example.com', subject: 'string', body: 'string' } }
          });
        }

        result = await gmailSvc.createDraft(req.user.googleSub, {
          to: params.to.trim(),
          subject: params.subject.trim(),
          body: params.body
        });
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
          result = await gmailSvc.sendDraft(req.user.googleSub, params.draftId);
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
          result = await gmailSvc.sendEmail(req.user.googleSub, params);
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
        result = await gmailSvc.replyToEmail(
          req.user.googleSub,
          params.messageId,
          params
        );
        break;

      case 'modify':
        result = await Promise.all(
          (params.ids || []).map(id =>
            gmailSvc.modifyMessageLabels(req.user.googleSub, id, params.actions)
          )
        );
        break;

      case 'attachmentPreview':
        if (params.mode === 'text') {
          result = await gmailSvc.previewAttachmentText(
            req.user.googleSub,
            params.messageId,
            params.attachmentId,
            params.maxKb || 256
          );
        } else if (params.mode === 'table') {
          result = await gmailSvc.previewAttachmentTable(
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
          result = await gmailSvc.listLabels(req.user.googleSub);
        } else if (params.modify) {
          result = await gmailSvc.modifyMessageLabels(
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
    
    const mutationRedirect = (operation) => {
      const redirectMap = {
        update: '/api/contacts/actions/modify',
        delete: '/api/contacts/actions/delete',
        bulkDelete: '/api/contacts/actions/bulkDelete'
      };

      return res.status(410).json({
        ok: false,
        error: 'Contacts RPC mutation disabled',
        message: `The contacts RPC no longer supports the \"${operation}\" operation. Call the dedicated facade endpoint instead.`,
        code: 'CONTACTS_RPC_MUTATION_DISABLED',
        endpoints: redirectMap
      });
    };

    switch (op) {
      case 'list':
        result = await contactsSvc.listAllContacts(req.user.accessToken);
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
        result = await contactsSvc.searchContacts(req.user.accessToken, params.query);
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
        result = await contactsSvc.addContact(req.user.accessToken, params);
        break;
        
      case 'update':
        return mutationRedirect('update');

      case 'delete':
        return mutationRedirect('delete');
        
      case 'dedupe':
        result = await contactsSvc.findDuplicates(req.user.accessToken);
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
        result = await contactsSvc.bulkUpsert(req.user.accessToken, params.contacts);
        break;
        
      case 'bulkDelete':
        return mutationRedirect('bulkDelete');
        
      case 'addressSuggest':
        if (!params || !params.query) {
          return res.status(400).json({
            error: 'Bad request',
            message: 'addressSuggest requires params.query',
            code: 'INVALID_PARAM',
            expectedFormat: { op: 'addressSuggest', params: { query: 'partial name or email' } }
          });
        }
        result = await contactsSvc.getAddressSuggestions(req.user.accessToken, params.query);
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
    let { op, params } = req.body;

    if (!op) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Missing required field: op',
        code: 'INVALID_PARAM'
      });
    }

    if (!params || typeof params !== 'object') {
      const fallbackKeys = {
        list: ['taskListId', 'maxResults', 'pageToken', 'showCompleted'],
        get: ['taskListId', 'taskId'],
        create: ['title', 'notes', 'due'],
        update: ['taskListId', 'taskId', 'updates'],
        delete: ['taskListId', 'taskId'],
        complete: ['taskListId', 'taskId'],
        reopen: ['taskListId', 'taskId']
      }[op] || [];

      if (fallbackKeys.length > 0) {
        const fallback = {};
        for (const key of fallbackKeys) {
          if (Object.prototype.hasOwnProperty.call(req.body, key)) {
            fallback[key] = req.body[key];
          }
        }

        if (Object.keys(fallback).length > 0 || op === 'list') {
          params = fallback;
        }
      }
    }

    if (!params) {
      params = {};
    }

    let result;

    switch (op) {
      case 'list':
        result = await tasksSvc.listTasks(req.user.googleSub, params);
        break;
        
      case 'get':
        // TODO: tasksSvc.getTask not exported - needs implementation
        return res.status(501).json({
          error: 'Not implemented',
          message: 'Get single task not yet implemented',
          code: 'NOT_IMPLEMENTED'
        });
        // result = await tasksSvc.getTask(
        //   req.user.googleSub,
        //   params.taskListId,
        //   params.taskId
        // );
        // break;
        
      case 'create':
        result = await tasksSvc.createTask(req.user.googleSub, params);
        break;
        
      case 'update':
        result = await tasksSvc.updateTask(
          req.user.googleSub,
          params.taskListId,
          params.taskId,
          params.updates
        );
        break;
        
      case 'delete':
        result = await tasksSvc.deleteTask(
          req.user.googleSub,
          params.taskListId,
          params.taskId
        );
        break;
        
      case 'complete':
        result = await tasksSvc.updateTask(
          req.user.googleSub,
          params.taskListId,
          params.taskId,
          { status: 'completed' }
        );
        break;
        
      case 'reopen':
        result = await tasksSvc.updateTask(
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
