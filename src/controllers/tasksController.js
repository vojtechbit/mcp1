import * as tasksService from '../services/tasksService.js';
import { computeETag, checkETagMatch } from '../utils/helpers.js';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../config/limits.js';

/**
 * Tasks Controller
 * Manages Google Tasks
 */

/**
 * List all tasks
 * GET /api/tasks?maxResults=100&page=1
 * 
 * Note: Google Tasks API returns all tasks, so we implement client-side pagination
 * Features:
 * - Pagination support with hasMore
 * - ETag support for caching
 */
async function listTasks(req, res) {
  try {
    let { maxResults, page } = req.query;

    console.log('📋 Listing all tasks...');

    // Get all tasks from service
    const allTasks = await tasksService.listAllTasks(req.user.googleSub);

    // Implement client-side pagination
    const pageSize = Math.min(
      parseInt(maxResults) || PAGE_SIZE_DEFAULT,
      PAGE_SIZE_MAX
    );
    const currentPage = parseInt(page) || 1;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const paginatedTasks = allTasks.slice(startIndex, endIndex);
    const hasMore = endIndex < allTasks.length;

    const response = {
      success: true,
      count: paginatedTasks.length,
      totalCount: allTasks.length,
      tasks: paginatedTasks,
      hasMore,
      page: currentPage,
      pageSize
    };

    // ETag support
    const etag = computeETag(response);
    if (checkETagMatch(req.headers['if-none-match'], etag)) {
      return res.status(304).end();
    }

    res.setHeader('ETag', etag);
    res.json(response);

  } catch (error) {
    console.error('❌ Failed to list tasks');
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.response?.status,
      data: error.response?.data
    });
    
    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }
    
    res.status(error.statusCode || 500).json({
      error: 'Tasks list failed',
      message: error.message
    });
  }
}

/**
 * Create new task
 * POST /api/tasks
 * Body: { title, notes?, due? }
 */
async function createTask(req, res) {
  try {
    const { title, notes, due } = req.body;

    if (!title) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required field: title'
      });
    }

    console.log(`➕ Creating task: ${title}`);
    if (notes) console.log(`   Notes: ${notes}`);
    if (due) console.log(`   Due: ${due}`);

    const task = await tasksService.createTask(req.user.googleSub, {
      title, 
      notes, 
      due
    });

    res.json({
      success: true,
      message: 'Task created successfully',
      task: task
    });

  } catch (error) {
    console.error('❌ Failed to create task');
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.response?.status,
      data: error.response?.data
    });
    
    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }
    
    res.status(error.statusCode || 500).json({
      error: 'Task creation failed',
      message: error.message
    });
  }
}

/**
 * Update task (mark as completed or modify)
 * PATCH /api/tasks/:taskListId/:taskId
 * Body: { status?, title?, notes?, due? }
 */
async function updateTask(req, res) {
  try {
    const { taskListId, taskId } = req.params;
    const updates = req.body;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No update fields provided'
      });
    }

    console.log(`✏️  Updating task ${taskId} in list ${taskListId}`);
    console.log('   Updates:', updates);

    const task = await tasksService.updateTask(
      req.user.googleSub,
      taskListId,
      taskId,
      updates
    );

    res.json({
      success: true,
      message: 'Task updated successfully',
      task: task
    });

  } catch (error) {
    console.error('❌ Failed to update task');
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.response?.status,
      data: error.response?.data
    });
    
    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }
    
    res.status(error.statusCode || 500).json({
      error: 'Task update failed',
      message: error.message
    });
  }
}

/**
 * Delete task
 * DELETE /api/tasks/:taskListId/:taskId
 */
async function deleteTask(req, res) {
  try {
    const { taskListId, taskId } = req.params;

    console.log(`🗑️  Deleting task ${taskId} from list ${taskListId}`);

    await tasksService.deleteTask(req.user.googleSub, taskListId, taskId);

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });

  } catch (error) {
    console.error('❌ Failed to delete task');
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.response?.status,
      data: error.response?.data
    });
    
    if (error.code === 'AUTH_REQUIRED' || error.statusCode === 401) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Your session has expired. Please log in again.',
        code: 'AUTH_REQUIRED'
      });
    }
    
    res.status(error.statusCode || 500).json({
      error: 'Task deletion failed',
      message: error.message
    });
  }
}

export {
  listTasks,
  createTask,
  updateTask,
  deleteTask
};
