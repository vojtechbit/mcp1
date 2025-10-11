import { google } from 'googleapis';
import { getUserByGoogleSub, updateTokens, updateLastUsed } from './databaseService.js';
import { refreshAccessToken } from '../config/oauth.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Google Sheets & Drive Service
 * Handles reading/writing to Google Sheets for contacts
 */

const CONTACTS_SHEET_NAME = 'MCP1 Contacts'; // Name of the Google Sheet

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
 * Get authenticated Sheets API client
 * Creates a NEW OAuth2 client instance for each request to avoid conflicts
 */
async function getSheetsClient(googleSub) {
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
    
    return google.sheets({ version: 'v4', auth: client });

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to get Sheets client');
    console.error('Details:', {
      googleSub,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Get authenticated Drive API client (to search for sheets)
 * Creates a NEW OAuth2 client instance for each request to avoid conflicts
 */
async function getDriveClient(googleSub) {
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
    
    return google.drive({ version: 'v3', auth: client });

  } catch (error) {
    console.error('❌ [DRIVE_ERROR] Failed to get Drive client');
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

    console.log(`🔍 Searching for sheet: "${CONTACTS_SHEET_NAME}"`);

    const response = await drive.files.list({
      q: `name='${CONTACTS_SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (response.data.files && response.data.files.length > 0) {
      console.log(`✅ Found sheet: ${response.data.files[0].name} (${response.data.files[0].id})`);
      return response.data.files[0].id;
    }

    console.log(`⚠️  Sheet "${CONTACTS_SHEET_NAME}" not found`);
    return null;

  } catch (error) {
    console.error('❌ [DRIVE_ERROR] Failed to find contacts sheet');
    console.error('Details:', {
      sheetName: CONTACTS_SHEET_NAME,
      errorMessage: error.message,
      statusCode: error.response?.status,
      errorData: error.response?.data,
      timestamp: new Date().toISOString()
    });
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

    console.log(`🔍 Searching contacts for query: "${searchQuery}"`);

    // Read all contacts from Sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A2:C1000', // Skip header row, read Name, Email, Notes
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      console.log('⚠️  No contacts found in sheet');
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

    console.log(`✅ Found ${matches.length} matching contacts`);
    return matches;

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to search contacts');
    console.error('Details:', {
      searchQuery,
      errorMessage: error.message,
      statusCode: error.response?.status,
      errorData: error.response?.data,
      timestamp: new Date().toISOString()
    });
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

    console.log('📋 Listing all contacts...');

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

    console.log(`✅ Found ${contacts.length} contacts`);
    return contacts;

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to list contacts');
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

    console.log(`➕ Adding contact: ${name} (${email})`);

    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:C',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[name, email, notes || '']]
      }
    });

    console.log(`✅ Contact added successfully`);
    return { name, email, notes: notes || '' };

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to add contact');
    console.error('Details:', {
      contactData,
      errorMessage: error.message,
      statusCode: error.response?.status,
      errorData: error.response?.data,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

export {
  searchContacts,
  listAllContacts,
  addContact
};
