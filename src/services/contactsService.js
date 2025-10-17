import { google } from 'googleapis';
import { getUserByGoogleSub, updateTokens, updateLastUsed } from './databaseService.js';
import { refreshAccessToken } from '../config/oauth.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Google Sheets & Drive Service
 * Handles reading/writing to Google Sheets for contacts
 * 
 * NEW STRUCTURE: Name | Email | Notes | Property | Phone
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
 * Create a new contacts sheet with proper headers
 * Returns spreadsheet ID
 * NEW: Now creates 5 columns: Name | Email | Notes | Property | Phone
 */
async function createContactsSheet(googleSub) {
  try {
    const sheets = await getSheetsClient(googleSub);

    console.log(`📝 Creating new sheet: "${CONTACTS_SHEET_NAME}"`);

    // Create new spreadsheet with 5 columns
    const createResponse = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: CONTACTS_SHEET_NAME
        },
        sheets: [
          {
            properties: {
              title: 'Sheet1',
              gridProperties: {
                rowCount: 1000,
                columnCount: 5 // Changed from 3 to 5
              }
            }
          }
        ]
      }
    });

    const spreadsheetId = createResponse.data.spreadsheetId;
    console.log(`✅ Sheet created with ID: ${spreadsheetId}`);

    // Add header row with new columns
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1:E1', // Changed from A1:C1 to A1:E1
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Name', 'Email', 'Notes', 'Property', 'Phone']] // Added Property and Phone
      }
    });

    // Make header row bold
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true
                  }
                }
              },
              fields: 'userEnteredFormat.textFormat.bold'
            }
          }
        ]
      }
    });

    console.log(`✅ Header row added: Name | Email | Notes | Property | Phone`);
    return spreadsheetId;

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to create contacts sheet');
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
 * Get or create contacts sheet
 * Returns spreadsheet ID (creates new one if not found)
 */
async function getOrCreateContactsSheet(googleSub) {
  let spreadsheetId = await findContactsSheet(googleSub);
  
  if (!spreadsheetId) {
    console.log('📝 Sheet not found, creating new one...');
    spreadsheetId = await createContactsSheet(googleSub);
  }
  
  return spreadsheetId;
}

/**
 * Search contacts in Google Sheet
 * Returns array of matching contacts
 * NEW: Now searches in name, email, notes, property, and phone
 */
async function searchContacts(googleSub, searchQuery) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    console.log(`🔍 Searching contacts for query: "${searchQuery}"`);

    // Read all contacts from Sheet (now with 5 columns)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A2:E1000', // Changed from A2:C1000 to A2:E1000
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      console.log('⚠️  No contacts found in sheet');
      return [];
    }

    // Filter contacts based on search query (search in all fields including property)
    const query = searchQuery.toLowerCase();
    const matches = rows
      .filter(row => {
        const name = (row[0] || '').toLowerCase();
        const email = (row[1] || '').toLowerCase();
        const notes = (row[2] || '').toLowerCase();
        const property = (row[3] || '').toLowerCase(); // NEW
        const phone = (row[4] || '').toLowerCase();     // NEW
        return name.includes(query) || email.includes(query) || 
               notes.includes(query) || property.includes(query) || 
               phone.includes(query);
      })
      .map(row => ({
        name: row[0] || '',
        email: row[1] || '',
        notes: row[2] || '',
        property: row[3] || '',  // NEW
        phone: row[4] || ''       // NEW
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
 * NEW: Now returns property and phone fields
 */
async function listAllContacts(googleSub) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    console.log('📋 Listing all contacts...');

    // Read all contacts from Sheet (now with 5 columns)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A2:E1000', // Changed from A2:C1000 to A2:E1000
    });

    const rows = response.data.values || [];

    const contacts = rows.map(row => ({
      name: row[0] || '',
      email: row[1] || '',
      notes: row[2] || '',
      property: row[3] || '',  // NEW
      phone: row[4] || ''       // NEW
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
 * Checks if email already exists and returns conflict info if so
 * NEW: Now supports property and phone fields
 */
async function addContact(googleSub, contactData) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    const { name, email, notes, property, phone } = contactData;

    console.log(`➕ Adding contact: ${name} (${email})`);
    if (property) console.log(`   Property: ${property}`);
    if (phone) console.log(`   Phone: ${phone}`);

    // Check if email already exists
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A2:E1000', // Changed from A2:C1000
    });

    const rows = response.data.values || [];
    
    // Find existing contact with same email
    const existingContact = rows.find(row => {
      const rowEmail = (row[1] || '').toLowerCase().trim();
      return rowEmail === email.toLowerCase().trim();
    });

    if (existingContact) {
      console.log(`⚠️  Contact with email ${email} already exists`);
      const error = new Error(`Contact with email ${email} already exists`);
      error.code = 'CONTACT_EXISTS';
      error.statusCode = 409; // Conflict
      error.existingContact = {
        name: existingContact[0] || '',
        email: existingContact[1] || '',
        notes: existingContact[2] || '',
        property: existingContact[3] || '',  // NEW
        phone: existingContact[4] || ''       // NEW
      };
      throw error;
    }

    // Append new row with 5 columns
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:E', // Changed from A:C
      valueInputOption: 'RAW',
      requestBody: {
        values: [[name, email, notes || '', property || '', phone || '']] // Added property and phone
      }
    });

    console.log(`✅ Contact added successfully`);
    return { name, email, notes: notes || '', property: property || '', phone: phone || '' };

  } catch (error) {
    // If it's our CONTACT_EXISTS error, re-throw it
    if (error.code === 'CONTACT_EXISTS') {
      throw error;
    }
    
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

/**
 * Update existing contact (finds by name+email and updates all fields)
 * If contact doesn't exist, adds it as new
 * NEW: Now supports updating property and phone
 */
async function updateContact(googleSub, contactData) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    const { name, email, notes, property, phone } = contactData;

    console.log(`✏️  Updating contact: ${name} (${email})`);

    // Read all contacts to find existing one
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A2:E1000', // Changed from A2:C1000
    });

    const rows = response.data.values || [];

    // Find row with matching name AND email
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const rowName = (rows[i][0] || '').toLowerCase();
      const rowEmail = (rows[i][1] || '').toLowerCase();
      
      if (rowName === name.toLowerCase() && rowEmail === email.toLowerCase()) {
        rowIndex = i + 2; // +2 because: +1 for header row, +1 for 0-based to 1-based
        break;
      }
    }

    if (rowIndex === -1) {
      // Contact not found, add as new
      console.log('⚠️  Contact not found, adding as new');
      return await addContact(googleSub, contactData);
    }

    // Update existing row with all 5 columns
    console.log(`🔄 Updating row ${rowIndex}`);
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `A${rowIndex}:E${rowIndex}`, // Changed from A${rowIndex}:C${rowIndex}
      valueInputOption: 'RAW',
      requestBody: {
        values: [[name, email, notes || '', property || '', phone || '']] // Added property and phone
      }
    });

    console.log(`✅ Contact updated successfully`);
    return { name, email, notes: notes || '', property: property || '', phone: phone || '' };

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to update contact');
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

/**
 * Delete contact from Google Sheet
 * Can delete by email OR by name+email combination
 * NEW FUNCTION
 */
async function deleteContact(googleSub, { email, name }) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    console.log(`🗑️  Deleting contact: ${name ? `${name} (${email})` : email}`);

    // Read all contacts to find the one to delete
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A2:E1000',
    });

    const rows = response.data.values || [];

    // Find row index to delete
    let rowIndex = -1;
    let deletedContact = null;

    for (let i = 0; i < rows.length; i++) {
      const rowEmail = (rows[i][1] || '').toLowerCase().trim();
      const rowName = (rows[i][0] || '').toLowerCase().trim();
      
      // Match by email only, or by name+email if both provided
      if (name) {
        if (rowEmail === email.toLowerCase().trim() && rowName === name.toLowerCase().trim()) {
          rowIndex = i + 2;
          deletedContact = {
            name: rows[i][0] || '',
            email: rows[i][1] || '',
            notes: rows[i][2] || '',
            property: rows[i][3] || '',
            phone: rows[i][4] || ''
          };
          break;
        }
      } else {
        if (rowEmail === email.toLowerCase().trim()) {
          rowIndex = i + 2;
          deletedContact = {
            name: rows[i][0] || '',
            email: rows[i][1] || '',
            notes: rows[i][2] || '',
            property: rows[i][3] || '',
            phone: rows[i][4] || ''
          };
          break;
        }
      }
    }

    if (rowIndex === -1) {
      console.log(`⚠️  Contact not found: ${name ? `${name} (${email})` : email}`);
      const error = new Error(`Contact not found: ${name ? `${name} (${email})` : email}`);
      error.code = 'CONTACT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // Delete the row using batchUpdate
    console.log(`🗑️  Deleting row ${rowIndex}`);
    
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0, // Usually the first sheet
                dimension: 'ROWS',
                startIndex: rowIndex - 1, // 0-based index
                endIndex: rowIndex         // Exclusive end
              }
            }
          }
        ]
      }
    });

    console.log(`✅ Contact deleted successfully`);
    return {
      success: true,
      deleted: deletedContact
    };

  } catch (error) {
    // If it's our CONTACT_NOT_FOUND error, re-throw it
    if (error.code === 'CONTACT_NOT_FOUND') {
      throw error;
    }
    
    console.error('❌ [SHEETS_ERROR] Failed to delete contact');
    console.error('Details:', {
      email,
      name,
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
  addContact,
  updateContact,
  deleteContact  // NEW EXPORT
};
