/**
 * Tasks Actions Controller - BFF helpers for GPT integrations
 *
 * Provides dedicated mutation endpoints that wrap the tasks service
 * directly instead of going through the generic RPC layer.
 */
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';


import * as tasksService from '../services/tasksService.js';

const overrides = globalThis.__TASKS_ACTIONS_TEST_OVERRIDES || {};
const tasksSvc = overrides.tasksService || tasksService;

function normalizeTaskListId(payload = {}) {
  return (
    payload.taskListId ||
    payload.tasklistId ||
    payload.listId ||
    payload.list_id ||
    null
  );
}

function normalizeTaskId(payload = {}) {
  return payload.taskId || payload.task_id || payload.id || null;
}

function normalizeDueDate(due) {
  if (!due) {
    return due;
  }

  if (due instanceof Date) {
    return due.toISOString();
  }

  if (typeof due !== 'string') {
    return due;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return `${due}T00:00:00.000Z`;
  }

  if (!due.endsWith('Z') && !due.includes('+')) {
    if (!due.includes('T')) {
      return `${due}T00:00:00.000Z`;
    }

    if (!due.includes('.')) {
      return `${due}.000Z`;
    }

    return `${due}Z`;
  }

  return due;
}

function buildUpdatePayload(body = {}) {
  const updates = { ...(body.updates || {}) };

  if (body.status !== undefined) {
    updates.status = body.status;
  }

  if (body.title !== undefined) {
    updates.title = body.title;
  }

  if (body.notes !== undefined) {
    updates.notes = body.notes;
  }

  if (body.due !== undefined) {
    updates.due = body.due;
  }

  if (updates.due !== undefined) {
    updates.due = normalizeDueDate(updates.due);
  }

  return updates;
}

async function createTask(req, res) {
  try {
    const { title, notes, due } = req.body || {};

    if (!title) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Missing required field: title',
        code: 'INVALID_PARAM'
      });
    }

    const payload = {
      title,
      notes,
      due: normalizeDueDate(due)
    };

    const task = await tasksSvc.createTask(req.user.googleSub, payload);

    return res.json({
      ok: true,
      task,
      message: 'Task created successfully'
    });
  } catch (error) {
    console.error('❌ Tasks create failed:', error.message);

    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }

    return res.status(error.statusCode || 500).json({
      error: 'Task create failed',
      message: error.message
    });
  }
}

async function modifyTask(req, res) {
  try {
    const body = req.body || {};
    const taskListId = normalizeTaskListId(body);
    const taskId = normalizeTaskId(body);
    const updates = buildUpdatePayload(body);

    if (!taskListId || !taskId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'modify requires taskListId and taskId',
        code: 'INVALID_PARAM',
        expectedFormat: {
          taskListId: 'string',
          taskId: 'string',
          status: 'completed|needsAction?',
          title: 'string?',
          notes: 'string?',
          due: 'RFC3339 timestamp?'
        }
      });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'modify requires at least one update field',
        code: 'INVALID_PARAM'
      });
    }

    const task = await tasksSvc.updateTask(
      req.user.googleSub,
      taskListId,
      taskId,
      updates
    );

    return res.json({
      ok: true,
      task,
      message: 'Task updated successfully'
    });
  } catch (error) {
    console.error('❌ Tasks modify failed:', error.message);

    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }

    return res.status(error.statusCode || 500).json({
      error: 'Task modify failed',
      message: error.message
    });
  }
}

async function deleteTask(req, res) {
  try {
    const body = req.body || {};
    const taskListId = normalizeTaskListId(body);
    const taskId = normalizeTaskId(body);

    if (!taskListId || !taskId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'delete requires taskListId and taskId',
        code: 'INVALID_PARAM',
        expectedFormat: {
          taskListId: 'string',
          taskId: 'string'
        }
      });
    }

    await tasksSvc.deleteTask(req.user.googleSub, taskListId, taskId);

    return res.json({
      ok: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('❌ Tasks delete failed:', error.message);

    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }

    return res.status(error.statusCode || 500).json({
      error: 'Task delete failed',
      message: error.message
    });
  }
}

const traced = wrapModuleFunctions('controllers.tasksActionsController', {
  createTask,
  modifyTask,
  deleteTask,
});

const {
  createTask: tracedCreateTask,
  modifyTask: tracedModifyTask,
  deleteTask: tracedDeleteTask,
} = traced;

export {
  tracedCreateTask as createTask,
  tracedModifyTask as modifyTask,
  tracedDeleteTask as deleteTask,
};
