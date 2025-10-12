import { google } from 'googleapis';
import { getUserByGoogleSub, updateTokens, updateLastUsed } from './databaseService.js';
import { refreshAccessToken } from '../config/oauth.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Google Tasks Service
 * Handles task management via Google Tasks API
 */

/**
 * Get valid access token (auto-refresh if expired)
 */
async function getValidAccessToken(googleSub) {
  try {
    const user = await getUserByGoogleSub(googleSub);
    
    if (!user) {
      throw new Error('User not found in database');
    }

    updateLastUsed(googleSub).catch(err => 
      console.error('Failed to update last_used:', err.message)
    );

    const now = new Date();
    const expiry = new Date(user.tokenExpiry);
    const bufferTime = 5 * 60 * 1000;

    if (now >= (expiry.getTime() - bufferTime)) {
      console.log('🔄 Access token expired, refreshing...');
      
      try {
        const newTokens = await refreshAccessToken(user.refreshToken);
        const expiryDate = new Date(Date.now() + ((newTokens.expiry_date || 3600) * 1000));
        
        await updateTokens(googleSub, {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token || user.refreshToken,
          expiryDate
        });

        console.log('✅ Access token refreshed successfully');
        return newTokens.access_token;
      } catch (refreshError) {
        console.error('❌ Token refresh failed - user needs to re-authenticate');
        const authError = new Error('Authentication required - please log in again');
        authError.code = 'AUTH_REQUIRED';
        authError.statusCode = 401;
        throw authError;
      }
    }

    return user.accessToken;
  } catch (error) {
    console.error('❌ [TOKEN_ERROR] Failed to get valid access token');
    console.error('Details:', {
      googleSub,
      errorMessage: error.message,
      errorCode: error.code,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Get authenticated Tasks API client
 * Creates a NEW OAuth2 client instance for each request to avoid conflicts
 */
async function getTasksClient(googleSub) {
  try {
    const accessToken = await getValidAccessToken(googleSub);
    
    // Create NEW OAuth2 client instance for this request
    const { OAuth2 } = google.auth;
    const client = new OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.REDIRECT_URI
    );
    
    client.setCredentials({ access_token: accessToken });
    
    return google.tasks({ version: 'v1', auth: client });

  } catch (error) {
    console.error('❌ [TASKS_ERROR] Failed to get Tasks client');
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
      console.log('⚠️  No task lists found');
      return [];
    }

    // Get tasks from each list
    const allTasks = [];

    for (const taskList of taskLists) {
      try {
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
      } catch (listError) {
        console.error(`⚠️  Failed to get tasks from list ${taskList.title}:`, listError.message);
        // Continue with other lists
      }
    }

    console.log(`✅ Found ${allTasks.length} tasks across ${taskLists.length} lists`);
    return allTasks;

  } catch (error) {
    console.error('❌ [TASKS_ERROR] Failed to list tasks');
    console.error('Details:', {
      errorMessage: error.message,
      statusCode: error.response?.status,
      errorData: error.response?.data,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Create a new task
 */
async function createTask(googleSub, taskData) {
  try {
    const tasksClient = await getTasksClient(googleSub);

    console.log('🔍 Looking for default task list...');

    // Get default task list
    const taskListsResponse = await tasksClient.tasklists.list({
      maxResults: 1
    });

    const taskLists = taskListsResponse.data.items || [];

    if (taskLists.length === 0) {
      throw new Error('No task lists found. Please create a task list in Google Tasks first.');
    }

    const defaultTaskListId = taskLists[0].id;
    console.log(`✅ Using task list: ${taskLists[0].title} (${defaultTaskListId})`);

    // Prepare request body
    const requestBody = {
      title: taskData.title
    };

    // Add optional fields only if provided
    if (taskData.notes) {
      requestBody.notes = taskData.notes;
    }

    if (taskData.due) {
      // Convert due date to RFC 3339 format (required by Tasks API)
      // Tasks API requires full timestamp but only uses the date part
      let dueDate = taskData.due;
      
      // If just date (YYYY-MM-DD), convert to RFC 3339
      if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        dueDate = `${dueDate}T00:00:00.000Z`;
      }
      // If datetime without timezone, add UTC timezone
      else if (!dueDate.endsWith('Z') && !dueDate.includes('+')) {
        dueDate = `${dueDate}.000Z`;
      }
      
      requestBody.due = dueDate;
      console.log(`📅 Due date converted to RFC 3339: ${dueDate}`);
    }

    console.log('📝 Creating task with data:', requestBody);

    // Create task
    const response = await tasksClient.tasks.insert({
      tasklist: defaultTaskListId,
      requestBody: requestBody
    });

    console.log('✅ Task created successfully:', response.data.id);

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
    console.error('❌ [TASKS_ERROR] Failed to create task');
    console.error('Details:', {
      title: taskData.title,
      errorMessage: error.message,
      statusCode: error.response?.status,
      errorData: error.response?.data,
      timestamp: new Date().toISOString()
    });
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

    console.log('📝 Updating task with data:', requestBody);

    const response = await tasksClient.tasks.patch({
      tasklist: taskListId,
      task: taskId,
      requestBody: requestBody
    });

    console.log('✅ Task updated successfully:', taskId);

    return {
      id: response.data.id,
      title: response.data.title,
      notes: response.data.notes || '',
      due: response.data.due || null,
      status: response.data.status
    };

  } catch (error) {
    console.error('❌ [TASKS_ERROR] Failed to update task');
    console.error('Details:', {
      taskId,
      taskListId,
      updates,
      errorMessage: error.message,
      statusCode: error.response?.status,
      errorData: error.response?.data,
      timestamp: new Date().toISOString()
    });
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

    console.log('✅ Task deleted successfully:', taskId);
    return { success: true };

  } catch (error) {
    console.error('❌ [TASKS_ERROR] Failed to delete task');
    console.error('Details:', {
      taskId,
      taskListId,
      errorMessage: error.message,
      statusCode: error.response?.status,
      errorData: error.response?.data,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

export {
  listAllTasks,
  createTask,
  updateTask,
  deleteTask
};
