import { google } from 'googleapis';
import { getUserByGoogleSub, updateLastUsed } from './databaseService.js';
import { refreshAccessToken } from '../config/oauth.js';

/**
 * Google Tasks Service
 * Handles task management via Google Tasks API
 */

/**
 * Get authenticated Tasks API client
 */
async function getTasksClient(googleSub) {
  try {
    const user = await getUserByGoogleSub(googleSub);

    if (!user) {
      throw new Error('User not found');
    }

    // Check if token is expired
    const now = new Date();
    const expiry = new Date(user.tokenExpiry);

    let accessToken = user.accessToken;

    if (now >= expiry) {
      console.log('🔄 Access token expired, refreshing...');
      const newTokens = await refreshAccessToken(user.refreshToken);
      accessToken = newTokens.access_token;

      // Update tokens in database
      const { updateTokens } = await import('./databaseService.js');
      await updateTokens(googleSub, {
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token || user.refreshToken,
        expiryDate: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000)
      });
    }

    // Update last used timestamp
    await updateLastUsed(googleSub);

    // Create OAuth2 client
    const { oauth2Client } = await import('../config/oauth.js');
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: user.refreshToken
    });

    return google.tasks({ version: 'v1', auth: oauth2Client });

  } catch (error) {
    console.error('❌ Failed to get Tasks client');
    console.error('Details:', {
      googleSub,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * List all tasks from all task lists
 */
async function listAllTasks(googleSub) {
  try {
    const tasks = await getTasksClient(googleSub);

    // First, get all task lists
    const taskListsResponse = await tasks.tasklists.list({
      maxResults: 100
    });

    const taskLists = taskListsResponse.data.items || [];

    if (taskLists.length === 0) {
      return [];
    }

    // Get tasks from each list
    const allTasks = [];

    for (const taskList of taskLists) {
      const tasksResponse = await tasks.tasks.list({
        tasklist: taskList.id,
        showCompleted: false, // Only show incomplete tasks
        showHidden: false
      });

      const listTasks = tasksResponse.data.items || [];

      // Add task list name to each task
      listTasks.forEach(task => {
        allTasks.push({
          id: task.id,
          title: task.title,
          notes: task.notes || '',
          due: task.due || null,
          status: task.status,
          taskList: taskList.title,
          taskListId: taskList.id
        });
      });
    }

    return allTasks;

  } catch (error) {
    console.error('❌ Failed to list tasks');
    throw error;
  }
}

/**
 * Create a new task
 */
async function createTask(googleSub, taskData) {
  try {
    const tasksClient = await getTasksClient(googleSub);

    // Get default task list
    const taskListsResponse = await tasksClient.tasklists.list({
      maxResults: 1
    });

    const taskLists = taskListsResponse.data.items || [];

    if (taskLists.length === 0) {
      throw new Error('No task lists found. Please create a task list in Google Tasks first.');
    }

    const defaultTaskListId = taskLists[0].id;

    // Create task
    const response = await tasksClient.tasks.insert({
      tasklist: defaultTaskListId,
      requestBody: {
        title: taskData.title,
        notes: taskData.notes || '',
        due: taskData.due || null
      }
    });

    return {
      id: response.data.id,
      title: response.data.title,
      notes: response.data.notes || '',
      due: response.data.due || null,
      status: response.data.status,
      taskList: taskLists[0].title,
      taskListId: defaultTaskListId
    };

  } catch (error) {
    console.error('❌ Failed to create task');
    throw error;
  }
}

/**
 * Update task (mark as completed or update details)
 */
async function updateTask(googleSub, taskListId, taskId, updates) {
  try {
    const tasksClient = await getTasksClient(googleSub);

    const requestBody = {};

    if (updates.status !== undefined) {
      requestBody.status = updates.status; // 'completed' or 'needsAction'
    }

    if (updates.title !== undefined) {
      requestBody.title = updates.title;
    }

    if (updates.notes !== undefined) {
      requestBody.notes = updates.notes;
    }

    if (updates.due !== undefined) {
      requestBody.due = updates.due;
    }

    const response = await tasksClient.tasks.patch({
      tasklist: taskListId,
      task: taskId,
      requestBody: requestBody
    });

    return {
      id: response.data.id,
      title: response.data.title,
      notes: response.data.notes || '',
      due: response.data.due || null,
      status: response.data.status
    };

  } catch (error) {
    console.error('❌ Failed to update task');
    throw error;
  }
}

/**
 * Delete a task
 */
async function deleteTask(googleSub, taskListId, taskId) {
  try {
    const tasksClient = await getTasksClient(googleSub);

    await tasksClient.tasks.delete({
      tasklist: taskListId,
      task: taskId
    });

    return { success: true };

  } catch (error) {
    console.error('❌ Failed to delete task');
    throw error;
  }
}

export {
  listAllTasks,
  createTask,
  updateTask,
  deleteTask
};
