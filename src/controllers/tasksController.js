import * as tasksService from '../services/tasksService.js';

/**
 * Tasks Controller
 * Manages Google Tasks
 */

/**
 * List all tasks
 * GET /api/tasks
 */
async function listTasks(req, res) {
  try {
    console.log('📋 Listing all tasks');

    const tasks = await tasksService.listAllTasks(req.user.googleSub);

    res.json({
      success: true,
      count: tasks.length,
      tasks: tasks
    });

  } catch (error) {
    console.error('❌ Failed to list tasks');
    res.status(500).json({
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

    const task = await tasksService.createTask(req.user.googleSub, {
      title, notes, due
    });

    res.json({
      success: true,
      message: 'Task created successfully',
      task: task
    });

  } catch (error) {
    console.error('❌ Failed to create task');
    res.status(500).json({
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

    console.log(`✏️ Updating task ${taskId} in list ${taskListId}`);

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
    res.status(500).json({
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
    res.status(500).json({
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
