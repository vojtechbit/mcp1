import { google } from 'googleapis';
import { getUserByGoogleSub, updateLastUsed } from './databaseService.js';
import { refreshAccessToken } from '../config/oauth.js';

/**
 * Google Sheets Service
 * Handles reading/writing to Google Sheets for contacts
 */

const CONTACTS_SHEET_NAME = 'MCP1 Contacts'; // Name of the Google Sheet

/**
 * Get authenticated Sheets API client
 */
async function getSheetsClient(googleSub) {
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

    return google.sheets({ version: 'v4', auth: oauth2Client });

  } catch (error) {
    console.error('❌ Failed to get Sheets client');
    console.error('Details:', {
      googleSub,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Find contacts sheet by name
 * Returns spreadsheet ID if found, null otherwise
 */
async function findContactsSheet(googleSub) {
  try {
    const drive = await getDriveClient(googleSub);

    const response = await drive.files.list({
      q: `name='${CONTACTS_SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id;
    }

    return null;

  } catch (error) {
    console.error('❌ Failed to find contacts sheet');
    throw error;
  }
}

/**
 * Get authenticated Drive API client (to search for sheets)
 */
async function getDriveClient(googleSub) {
  try {
    const user = await getUserByGoogleSub(googleSub);

    if (!user) {
      throw new Error('User not found');
    }

    // Check if token is expired (same logic as Sheets)
    const now = new Date();
    const expiry = new Date(user.tokenExpiry);

    let accessToken = user.accessToken;

    if (now >= expiry) {
      console.log('🔄 Access token expired, refreshing...');
      const newTokens = await refreshAccessToken(user.refreshToken);
      accessToken = newTokens.access_token;

      const { updateTokens } = await import('./databaseService.js');
      await updateTokens(googleSub, {
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token || user.refreshToken,
        expiryDate: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000)
      });
    }

    const { oauth2Client } = await import('../config/oauth.js');
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: user.refreshToken
    });

    return google.drive({ version: 'v3', auth: oauth2Client });

  } catch (error) {
    console.error('❌ Failed to get Drive client');
    throw error;
  }
}

/**
 * Search contacts in Google Sheet
 * Returns array of matching contacts
 */
async function searchContacts(googleSub, searchQuery) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await findContactsSheet(googleSub);

    if (!spreadsheetId) {
      throw new Error(`Contact sheet "${CONTACTS_SHEET_NAME}" not found. Please create it first.`);
    }

    // Read all contacts from Sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A2:C1000', // Skip header row, read Name, Email, Notes
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      return [];
    }

    // Filter contacts based on search query (search in name, email, and notes)
    const query = searchQuery.toLowerCase();
    const matches = rows
      .filter(row => {
        const name = (row[0] || '').toLowerCase();
        const email = (row[1] || '').toLowerCase();
        const notes = (row[2] || '').toLowerCase();
        return name.includes(query) || email.includes(query) || notes.includes(query);
      })
      .map(row => ({
        name: row[0] || '',
        email: row[1] || '',
        notes: row[2] || ''
      }));

    return matches;

  } catch (error) {
    console.error('❌ Failed to search contacts');
    throw error;
  }
}

/**
 * List all contacts from Google Sheet
 */
async function listAllContacts(googleSub) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await findContactsSheet(googleSub);

    if (!spreadsheetId) {
      throw new Error(`Contact sheet "${CONTACTS_SHEET_NAME}" not found. Please create it first.`);
    }

    // Read all contacts from Sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A2:C1000', // Skip header row
    });

    const rows = response.data.values || [];

    const contacts = rows.map(row => ({
      name: row[0] || '',
      email: row[1] || '',
      notes: row[2] || ''
    }));

    return contacts;

  } catch (error) {
    console.error('❌ Failed to list contacts');
    throw error;
  }
}

/**
 * Add new contact to Google Sheet
 */
async function addContact(googleSub, contactData) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await findContactsSheet(googleSub);

    if (!spreadsheetId) {
      throw new Error(`Contact sheet "${CONTACTS_SHEET_NAME}" not found. Please create it first.`);
    }

    const { name, email, notes } = contactData;

    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:C',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[name, email, notes || '']]
      }
    });

    return { name, email, notes: notes || '' };

  } catch (error) {
    console.error('❌ Failed to add contact');
    throw error;
  }
}

export {
  searchContacts,
  listAllContacts,
  addContact
};
