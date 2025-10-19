/**
 * Facade Controller - Handles macro endpoints
 */

import * as facadeService from '../services/facadeService.js';

// ==================== INBOX MACROS ====================

export async function macroInboxOverview(req, res) {
  try {
    const result = await facadeService.inboxOverview(req.user.googleSub, req.body);
    res.json(result);
  } catch (error) {
    console.error('❌ Macro inbox overview failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'REAUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      error: 'Inbox overview failed',
      message: error.message,
      code: 'SERVER_ERROR'
    });
  }
}

export async function macroInboxSnippets(req, res) {
  try {
    const result = await facadeService.inboxSnippets(req.user.googleSub, req.body);
    res.json(result);
  } catch (error) {
    console.error('❌ Macro inbox snippets failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'REAUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      error: 'Inbox snippets failed',
      message: error.message,
      code: 'SERVER_ERROR'
    });
  }
}

export async function macroEmailQuickRead(req, res) {
  try {
    const result = await facadeService.emailQuickRead(req.user.googleSub, req.body);
    res.json(result);
  } catch (error) {
    console.error('❌ Macro email quick read failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'REAUTH_REQUIRED'
      });
    }
    
    if (error.message.includes('No message IDs')) {
      return res.status(400).json({
        error: 'Bad request',
        message: error.message,
        code: 'INVALID_PARAM'
      });
    }
    
    res.status(500).json({
      error: 'Email quick read failed',
      message: error.message,
      code: 'SERVER_ERROR'
    });
  }
}

// ==================== CALENDAR MACROS ====================

export async function macroCalendarPlan(req, res) {
  try {
    const result = await facadeService.calendarPlan(req.user.googleSub, req.body);
    res.json(result);
  } catch (error) {
    console.error('❌ Macro calendar plan failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'REAUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      error: 'Calendar plan failed',
      message: error.message,
      code: 'SERVER_ERROR'
    });
  }
}

export async function macroCalendarSchedule(req, res) {
  try {
    const result = await facadeService.calendarSchedule(req.user.googleSub, req.body);
    res.json(result);
  } catch (error) {
    console.error('❌ Macro calendar schedule failed:', error.message);
    
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
      error: 'Calendar schedule failed',
      message: error.message,
      code: 'SERVER_ERROR'
    });
  }
}

export async function macroCalendarReminderDrafts(req, res) {
  try {
    const result = await facadeService.calendarReminderDrafts(req.user.googleSub, req.body);
    res.json(result);
  } catch (error) {
    console.error('❌ Macro calendar reminder drafts failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'REAUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      error: 'Calendar reminder drafts failed',
      message: error.message,
      code: 'SERVER_ERROR'
    });
  }
}

// ==================== CONTACTS MACROS ====================

export async function macroContactsSafeAdd(req, res) {
  try {
    const result = await facadeService.contactsSafeAdd(req.user.googleSub, req.body);
    res.json(result);
  } catch (error) {
    console.error('❌ Macro contacts safe add failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'REAUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      error: 'Contacts safe add failed',
      message: error.message,
      code: 'SERVER_ERROR'
    });
  }
}

// ==================== TASKS MACROS ====================

export async function macroTasksOverview(req, res) {
  try {
    const result = await facadeService.tasksOverview(req.user.googleSub, req.body);
    res.json(result);
  } catch (error) {
    console.error('❌ Macro tasks overview failed:', error.message);
    
    if (error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: error.message,
        code: 'REAUTH_REQUIRED'
      });
    }
    
    res.status(500).json({
      error: 'Tasks overview failed',
      message: error.message,
      code: 'SERVER_ERROR'
    });
  }
}
