import { google } from 'googleapis';
import { getUserByGoogleSub, updateTokens, updateLastUsed } from './databaseService.js';
import { refreshAccessToken } from '../config/oauth.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Google Sheets & Drive Service
 * Handles reading/writing to Google Sheets for contacts
 * 
 * STRUCTURE: Name | Email | Notes | RealEstate | Phone
 * Fixed range: A2:E (no hard row cap)
 */

const CONTACTS_SHEET_NAME = 'MCP1 Contacts'; // Name of the Google Sheet
const CONTACTS_RANGE = 'A2:E'; // Fixed range for all operations

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
 */
async function getSheetsClient(googleSub) {
  try {
    const accessToken = await getValidAccessToken(googleSub);
    
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
    throw error;
  }
}

/**
 * Get authenticated Drive API client
 */
async function getDriveClient(googleSub) {
  try {
    const accessToken = await getValidAccessToken(googleSub);
    
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
    throw error;
  }
}

/**
 * Find contacts sheet by name
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
    console.error('❌ [DRIVE_ERROR] Failed to find contacts sheet');
    throw error;
  }
}

/**
 * Create a new contacts sheet with proper headers
 * Columns: Name | Email | Notes | RealEstate | Phone
 */
async function createContactsSheet(googleSub) {
  try {
    const sheets = await getSheetsClient(googleSub);

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
                rowCount: 10000,
                columnCount: 5
              }
            }
          }
        ]
      }
    });

    const spreadsheetId = createResponse.data.spreadsheetId;

    // Add header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1:E1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Name', 'Email', 'Notes', 'RealEstate', 'Phone']]
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

    console.log(`✅ Contact sheet created with ID: ${spreadsheetId}`);
    return spreadsheetId;

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to create contacts sheet');
    throw error;
  }
}

/**
 * Get or create contacts sheet
 */
async function getOrCreateContactsSheet(googleSub) {
  let spreadsheetId = await findContactsSheet(googleSub);
  
  if (!spreadsheetId) {
    spreadsheetId = await createContactsSheet(googleSub);
  }
  
  return spreadsheetId;
}

/**
 * Helper: strip diacritics for fuzzy matching
 */
function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Helper: compute Jaro-Winkler similarity score
 */
function jaroWinkler(s1, s2) {
  const m1 = s1.length;
  const m2 = s2.length;
  
  if (m1 === 0 && m2 === 0) return 1.0;
  if (m1 === 0 || m2 === 0) return 0.0;
  
  const matchDistance = Math.floor(Math.max(m1, m2) / 2) - 1;
  const s1Matches = new Array(m1).fill(false);
  const s2Matches = new Array(m2).fill(false);
  
  let matches = 0;
  let transpositions = 0;
  
  for (let i = 0; i < m1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, m2);
    
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  
  if (matches === 0) return 0.0;
  
  let k = 0;
  for (let i = 0; i < m1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  
  const jaro = (matches / m1 + matches / m2 + (matches - transpositions / 2) / matches) / 3.0;
  
  // Winkler modification
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(m1, m2)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Search contacts in Google Sheet
 */
async function searchContacts(googleSub, searchQuery) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      return [];
    }

    const query = searchQuery.toLowerCase();
    const matches = rows
      .filter(row => {
        const name = (row[0] || '').toLowerCase();
        const email = (row[1] || '').toLowerCase();
        const notes = (row[2] || '').toLowerCase();
        const realEstate = (row[3] || '').toLowerCase();
        const phone = (row[4] || '').toLowerCase();
        return name.includes(query) || email.includes(query) || 
               notes.includes(query) || realEstate.includes(query) || 
               phone.includes(query);
      })
      .map(row => ({
        name: row[0] || '',
        email: row[1] || '',
        notes: row[2] || '',
        realEstate: row[3] || '',
        phone: row[4] || ''
      }));

    return matches;

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to search contacts');
    throw error;
  }
}

/**
 * Get address suggestions (fuzzy match on realEstate field only)
 * Matches partial addresses and returns up to 3 complete addresses with scores
 * Only searches realEstate column - not for names/emails
 */
async function getAddressSuggestions(googleSub, query) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];

    if (rows.length === 0 || !query) {
      return [];
    }

    const normalizedQuery = stripDiacritics(query.toLowerCase().trim());
    const tokens = normalizedQuery.split(/\s+/).filter(t => t.length > 0);

    if (tokens.length === 0) {
      return [];
    }

    // Score each contact based on realEstate field only
    const scored = rows.map(row => {
      const realEstate = row[3] || ''; // realEstate is column 3 (0-indexed)
      
      // Skip empty realEstate values
      if (!realEstate) {
        return { realEstate, score: 0 };
      }

      const normalizedAddress = stripDiacritics(realEstate.toLowerCase());

      // Token-based matching (how many tokens appear in address)
      let tokenScore = 0;
      for (const token of tokens) {
        if (normalizedAddress.includes(token)) {
          tokenScore += 2;
        }
      }

      // Jaro-Winkler similarity
      const addressSim = jaroWinkler(normalizedQuery, normalizedAddress);

      // Combined score: token matches + similarity
      const score = tokenScore + addressSim * 10;

      return {
        realEstate,
        score
      };
    });

    // Sort by score and take top 3 (only those with score > 0)
    scored.sort((a, b) => b.score - a.score);
    const top3 = scored.filter(c => c.score > 0).slice(0, 3);

    return top3.map(c => ({
      realEstate: c.realEstate,
      score: Math.round(c.score * 100) / 100
    }));

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to get address suggestions');
    throw error;
  }
}

/**
 * List all contacts from Google Sheet
 */
async function listAllContacts(googleSub) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];

    const contacts = rows.map((row, index) => ({
      rowIndex: index + 2, // For reference (1-based, +1 for header)
      name: row[0] || '',
      email: row[1] || '',
      notes: row[2] || '',
      realEstate: row[3] || '',
      phone: row[4] || ''
    }));

    return contacts;

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to list contacts');
    throw error;
  }
}

/**
 * Add new contact to Google Sheet
 * Always appends, never auto-merges
 * Returns duplicate info if email exists
 */
async function addContact(googleSub, contactData) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    const { name, email, notes, realEstate, phone } = contactData;

    // Check for duplicates
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];
    
    const duplicates = [];
    rows.forEach((row, index) => {
      const rowEmail = (row[1] || '').toLowerCase().trim();
      if (rowEmail === email.toLowerCase().trim()) {
        duplicates.push({
          rowIndex: index + 2,
          name: row[0] || '',
          email: row[1] || '',
          notes: row[2] || '',
          realEstate: row[3] || '',
          phone: row[4] || ''
        });
      }
    });

    // Always append (no auto-merge)
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[name, email, notes || '', realEstate || '', phone || '']]
      }
    });

    const result = { 
      name, 
      email, 
      notes: notes || '', 
      realEstate: realEstate || '', 
      phone: phone || '' 
    };

    if (duplicates.length > 0) {
      result.duplicates = duplicates;
    }

    return result;

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to add contact');
    throw error;
  }
}

/**
 * Bulk upsert contacts
 * Always appends new rows, never auto-merges
 * Returns duplicates array so assistant can suggest merge
 */
async function bulkUpsert(googleSub, contacts) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    // Get existing contacts to check for duplicates
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const existingRows = response.data.values || [];
    const existingEmails = new Map();
    
    existingRows.forEach((row, index) => {
      const email = (row[1] || '').toLowerCase().trim();
      if (email) {
        if (!existingEmails.has(email)) {
          existingEmails.set(email, []);
        }
        existingEmails.get(email).push({
          rowIndex: index + 2,
          name: row[0] || '',
          email: row[1] || '',
          notes: row[2] || '',
          realEstate: row[3] || '',
          phone: row[4] || ''
        });
      }
    });

    // Prepare rows to append
    const newRows = contacts.map(c => [
      c.name || '',
      c.email || '',
      c.notes || '',
      c.realEstate || '',
      c.phone || ''
    ]);

    // Append all rows
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: newRows
      }
    });

    // Find duplicates
    const duplicates = [];
    for (const contact of contacts) {
      const email = (contact.email || '').toLowerCase().trim();
      if (existingEmails.has(email)) {
        duplicates.push({
          email,
          newContact: contact,
          existing: existingEmails.get(email)
        });
      }
    }

    return {
      inserted: contacts.length,
      duplicates: duplicates.length > 0 ? duplicates : undefined
    };

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to bulk upsert contacts');
    throw error;
  }
}

/**
 * Bulk delete contacts
 * Can delete by emails array OR rowIds array
 * 
 * MODES:
 * 1. emails mode: Deletes ALL rows with specified emails (removes entire contact)
 * 2. rowIds mode: Deletes exactly those row IDs (surgical deletion, keeps others)
 * 
 * ChatGPT usage examples:
 * - Delete contact completely: {emails: ["john@example.com"]}
 * - Delete specific duplicates: {rowIds: [3, 5]} (keeps row 2 if it has same email)
 */
async function bulkDelete(googleSub, { emails, rowIds }) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    let rowsToDelete = [];

    if (emails && emails.length > 0) {
      // EMAIL MODE: Find all rows with specified emails and delete ALL
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: CONTACTS_RANGE,
      });

      const rows = response.data.values || [];
      const emailSet = new Set(emails.map(e => e.toLowerCase().trim()));

      rows.forEach((row, index) => {
        const rowEmail = (row[1] || '').toLowerCase().trim();
        if (emailSet.has(rowEmail)) {
          rowsToDelete.push(index + 2); // 1-based, +1 for header
        }
      });
    } else if (rowIds && rowIds.length > 0) {
      // ROWID MODE: Delete exact row IDs (no searching)
      rowsToDelete = rowIds;
    }

    if (rowsToDelete.length === 0) {
      return { deleted: 0 };
    }

    console.log(`📊 Deleting rows: ${rowsToDelete.join(', ')}`);

    // Sort in descending order to delete from bottom to top
    // CRITICAL: Must delete highest row first to avoid index shifts
    rowsToDelete.sort((a, b) => b - a);
    console.log(`📍 Delete order (bottom-to-top): ${rowsToDelete.join(', ')}`);

    // Build delete requests
    const requests = rowsToDelete.map(rowIndex => ({
      deleteDimension: {
        range: {
          sheetId: 0,
          dimension: 'ROWS',
          startIndex: rowIndex - 1, // 0-based
          endIndex: rowIndex
        }
      }
    }));

    // Execute batch delete
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });

    return { deleted: rowsToDelete.length };

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to bulk delete contacts');
    throw error;
  }
}

/**
 * Update existing contact
 */
async function updateContact(googleSub, contactData) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    const { name, email, notes, realEstate, phone } = contactData;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];

    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const rowName = (rows[i][0] || '').toLowerCase();
      const rowEmail = (rows[i][1] || '').toLowerCase();
      
      if (rowName === name.toLowerCase() && rowEmail === email.toLowerCase()) {
        rowIndex = i + 2;
        break;
      }
    }

    if (rowIndex === -1) {
      return await addContact(googleSub, contactData);
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `A${rowIndex}:E${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[name, email, notes || '', realEstate || '', phone || '']]
      }
    });

    return { name, email, notes: notes || '', realEstate: realEstate || '', phone: phone || '' };

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to update contact');
    throw error;
  }
}

/**
 * Delete contact from Google Sheet
 */
async function deleteContact(googleSub, { email, name }) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];

    let rowIndex = -1;
    let deletedContact = null;

    for (let i = 0; i < rows.length; i++) {
      const rowEmail = (rows[i][1] || '').toLowerCase().trim();
      const rowName = (rows[i][0] || '').toLowerCase().trim();
      
      if (name) {
        if (rowEmail === email.toLowerCase().trim() && rowName === name.toLowerCase().trim()) {
          rowIndex = i + 2;
          deletedContact = {
            name: rows[i][0] || '',
            email: rows[i][1] || '',
            notes: rows[i][2] || '',
            realEstate: rows[i][3] || '',
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
            realEstate: rows[i][3] || '',
            phone: rows[i][4] || ''
          };
          break;
        }
      }
    }

    if (rowIndex === -1) {
      const error = new Error(`Contact not found: ${name ? `${name} (${email})` : email}`);
      error.code = 'CONTACT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex
              }
            }
          }
        ]
      }
    });

    return {
      success: true,
      deleted: deletedContact
    };

  } catch (error) {
    if (error.code === 'CONTACT_NOT_FOUND') {
      throw error;
    }
    console.error('❌ [SHEETS_ERROR] Failed to delete contact');
    throw error;
  }
}

/**
 * Find duplicate contacts in Google Sheet
 * Groups contacts by email (primary key)
 * Returns groups with 2+ matching emails
 */
async function findDuplicates(googleSub) {
  try {
    const sheets = await getSheetsClient(googleSub);
    const spreadsheetId = await getOrCreateContactsSheet(googleSub);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];
    const emailMap = {}; // email -> [contacts with that email]

    // Group contacts by email
    for (let i = 0; i < rows.length; i++) {
      const email = (rows[i][1] || '').toLowerCase().trim();
      
      if (email) { // Only process if email exists
        const contact = {
          name: rows[i][0] || '',
          email: rows[i][1] || '',
          notes: rows[i][2] || '',
          realestate: rows[i][3] || '',
          phone: rows[i][4] || '',
          rowIndex: i + 2 // Sheet row number (1-indexed, starting from row 2)
        };

        if (!emailMap[email]) {
          emailMap[email] = [];
        }
        emailMap[email].push(contact);
      }
    }

    // Extract only actual duplicates (email appears 2+ times)
    const duplicates = Object.values(emailMap)
      .filter(group => group.length > 1)
      .sort((a, b) => b.length - a.length); // Sort by group size descending

    return {
      duplicates,
      count: duplicates.length,
      totalDuplicateContacts: duplicates.reduce((sum, group) => sum + group.length, 0)
    };

  } catch (error) {
    console.error('❌ Failed to find duplicates:', error.message);
    throw error;
  }
}

export {
  searchContacts,
  getAddressSuggestions,
  listAllContacts,
  addContact,
  bulkUpsert,
  bulkDelete,
  updateContact,
  deleteContact,
  findDuplicates
};
