import { google } from 'googleapis';
import { refreshAccessToken } from '../config/oauth.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Contacts Service - Google Sheets Storage
 * 
 * ✅ SHEETS ONLY - NO MONGODB
 * All contact data is stored in Google Sheets.
 * Authentication tokens are passed from caller (controller/RPC).
 * 
 * STRUCTURE: Name | Email | Notes | RealEstate | Phone
 */

const CONTACTS_SHEET_NAME = 'MCP1 Contacts';
const CONTACTS_RANGE = 'A2:E';

/**
 * Get authenticated Sheets API client
 */
async function getSheetsClient(accessToken) {
  try {
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
async function getDriveClient(accessToken) {
  try {
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
async function findContactsSheet(accessToken) {
  try {
    const drive = await getDriveClient(accessToken);

    const response = await drive.files.list({
      q: `name='${CONTACTS_SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    return response.data.files?.[0]?.id || null;

  } catch (error) {
    console.error('❌ [DRIVE_ERROR] Failed to find contacts sheet');
    throw error;
  }
}

/**
 * Create a new contacts sheet with proper headers
 */
async function createContactsSheet(accessToken) {
  try {
    const sheets = await getSheetsClient(accessToken);

    const createResponse = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: CONTACTS_SHEET_NAME },
        sheets: [{
          properties: {
            title: 'Sheet1',
            gridProperties: { rowCount: 10000, columnCount: 5 }
          }
        }]
      }
    });

    const spreadsheetId = createResponse.data.spreadsheetId;

    // Add header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1:E1',
      valueInputOption: 'RAW',
      requestBody: { values: [['Name', 'Email', 'Notes', 'RealEstate', 'Phone']] }
    });

    // Make header bold
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold'
          }
        }]
      }
    });

    console.log(`✅ Contact sheet created: ${spreadsheetId}`);
    return spreadsheetId;

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to create contacts sheet');
    throw error;
  }
}

/**
 * Get or create contacts sheet
 */
async function getOrCreateContactsSheet(accessToken) {
  let spreadsheetId = await findContactsSheet(accessToken);
  if (!spreadsheetId) {
    spreadsheetId = await createContactsSheet(accessToken);
  }
  return spreadsheetId;
}

function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function jaroWinkler(s1, s2) {
  const m1 = s1.length;
  const m2 = s2.length;
  
  if (m1 === 0 && m2 === 0) return 1.0;
  if (m1 === 0 || m2 === 0) return 0.0;
  
  const matchDistance = Math.floor(Math.max(m1, m2) / 2) - 1;
  const s1Matches = new Array(m1).fill(false);
  const s2Matches = new Array(m2).fill(false);
  
  let matches = 0, transpositions = 0;
  
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
async function searchContacts(accessToken, searchQuery) {
  try {
    const sheets = await getSheetsClient(accessToken);
    const spreadsheetId = await getOrCreateContactsSheet(accessToken);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) return [];

    const query = searchQuery.toLowerCase();
    return rows
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

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to search contacts');
    throw error;
  }
}

/**
 * Get address suggestions
 */
async function getAddressSuggestions(accessToken, query) {
  try {
    const sheets = await getSheetsClient(accessToken);
    const spreadsheetId = await getOrCreateContactsSheet(accessToken);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];
    if (rows.length === 0 || !query) return [];

    const normalizedQuery = stripDiacritics(query.toLowerCase().trim());
    const tokens = normalizedQuery.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return [];

    const scored = rows.map(row => {
      const realEstate = row[3] || '';
      if (!realEstate) return { realEstate, score: 0 };

      const normalizedAddress = stripDiacritics(realEstate.toLowerCase());
      let tokenScore = 0;
      for (const token of tokens) {
        if (normalizedAddress.includes(token)) tokenScore += 2;
      }

      const addressSim = jaroWinkler(normalizedQuery, normalizedAddress);
      return { realEstate, score: tokenScore + addressSim * 10 };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored
      .filter(c => c.score > 0)
      .slice(0, 3)
      .map(c => ({ realEstate: c.realEstate, score: Math.round(c.score * 100) / 100 }));

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to get address suggestions');
    throw error;
  }
}

/**
 * List all contacts
 */
async function listAllContacts(accessToken) {
  try {
    const sheets = await getSheetsClient(accessToken);
    const spreadsheetId = await getOrCreateContactsSheet(accessToken);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];
    return rows.map((row, index) => ({
      rowIndex: index + 2,
      name: row[0] || '',
      email: row[1] || '',
      notes: row[2] || '',
      realEstate: row[3] || '',
      phone: row[4] || ''
    }));

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to list contacts');
    throw error;
  }
}

/**
 * Add contact to Sheets
 */
async function addContact(accessToken, contactData) {
  try {
    const sheets = await getSheetsClient(accessToken);
    const spreadsheetId = await getOrCreateContactsSheet(accessToken);
    const { name, email, notes, realEstate, phone } = contactData;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];
    const duplicates = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => (row[1] || '').toLowerCase().trim() === email.toLowerCase().trim())
      .map(({ row, index }) => ({
        rowIndex: index + 2,
        name: row[0] || '',
        email: row[1] || '',
        notes: row[2] || '',
        realEstate: row[3] || '',
        phone: row[4] || ''
      }));

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[name, email, notes || '', realEstate || '', phone || '']]
      }
    });

    const result = { name, email, notes: notes || '', realEstate: realEstate || '', phone: phone || '' };
    if (duplicates.length > 0) result.duplicates = duplicates;
    return result;

  } catch (error) {
    console.error('❌ [SHEETS_ERROR] Failed to add contact');
    throw error;
  }
}

/**
 * Bulk upsert contacts
 */
async function bulkUpsert(accessToken, contacts) {
  try {
    const sheets = await getSheetsClient(accessToken);
    const spreadsheetId = await getOrCreateContactsSheet(accessToken);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const existingRows = response.data.values || [];
    const existingEmails = new Map();
    
    existingRows.forEach((row, index) => {
      const email = (row[1] || '').toLowerCase().trim();
      if (email) {
        if (!existingEmails.has(email)) existingEmails.set(email, []);
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

    const newRows = contacts.map(c => [
      c.name || '',
      c.email || '',
      c.notes || '',
      c.realEstate || '',
      c.phone || ''
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:E',
      valueInputOption: 'RAW',
      requestBody: { values: newRows }
    });

    const duplicates = contacts
      .filter(contact => existingEmails.has((contact.email || '').toLowerCase().trim()))
      .map(contact => ({
        email: contact.email,
        newContact: contact,
        existing: existingEmails.get((contact.email || '').toLowerCase().trim())
      }));

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
 * Bulk delete contacts (by emails or rowIds)
 */
async function bulkDelete(accessToken, { emails, rowIds }) {
  try {
    const sheets = await getSheetsClient(accessToken);
    const spreadsheetId = await getOrCreateContactsSheet(accessToken);

    let rowsToDelete = [];

    if (emails && emails.length > 0) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: CONTACTS_RANGE,
      });

      const rows = response.data.values || [];
      const emailSet = new Set(emails.map(e => e.toLowerCase().trim()));

      rows.forEach((row, index) => {
        const rowEmail = (row[1] || '').toLowerCase().trim();
        if (emailSet.has(rowEmail)) rowsToDelete.push(index + 2);
      });
    } else if (rowIds && rowIds.length > 0) {
      rowsToDelete = rowIds;
    }

    if (rowsToDelete.length === 0) return { deleted: 0 };

    console.log(`📊 Deleting rows: ${rowsToDelete.join(', ')}`);
    rowsToDelete.sort((a, b) => b - a);

    const requests = rowsToDelete.map(rowIndex => ({
      deleteDimension: {
        range: {
          sheetId: 0,
          dimension: 'ROWS',
          startIndex: rowIndex - 1,
          endIndex: rowIndex
        }
      }
    }));

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
 * Update contact
 */
async function updateContact(accessToken, contactData) {
  try {
    const sheets = await getSheetsClient(accessToken);
    const spreadsheetId = await getOrCreateContactsSheet(accessToken);
    const { name, email, notes, realEstate, phone } = contactData;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];
    let rowIndex = -1;

    for (let i = 0; i < rows.length; i++) {
      if ((rows[i][0] || '').toLowerCase() === name.toLowerCase() &&
          (rows[i][1] || '').toLowerCase() === email.toLowerCase()) {
        rowIndex = i + 2;
        break;
      }
    }

    if (rowIndex === -1) {
      return await addContact(accessToken, contactData);
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
 * Delete contact by email OR by name
 * - If email provided: delete by email
 * - If only name provided: find contact with that name and delete it
 * - If both: delete exact match (email + name)
 */
async function deleteContact(accessToken, { email, name }) {
  try {
    if (!email && !name) {
      const error = new Error('Must provide either email or name');
      error.statusCode = 400;
      throw error;
    }

    const sheets = await getSheetsClient(accessToken);
    const spreadsheetId = await getOrCreateContactsSheet(accessToken);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];
    let rowIndex = -1;
    let deletedContact = null;

    if (email) {
      // EMAIL MODE: Find by email (with optional name confirmation)
      for (let i = 0; i < rows.length; i++) {
        const rowEmail = (rows[i][1] || '').toLowerCase().trim();
        const rowName = (rows[i][0] || '').toLowerCase().trim();
        
        if (rowEmail === email.toLowerCase().trim()) {
          // If name also provided, must match both
          if (name && rowName !== name.toLowerCase().trim()) {
            continue;
          }
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
    } else {
      // NAME ONLY MODE: Find by name
      const nameToFind = name.toLowerCase().trim();
      const matches = [];
      
      for (let i = 0; i < rows.length; i++) {
        const rowName = (rows[i][0] || '').toLowerCase().trim();
        if (rowName === nameToFind) {
          matches.push({
            rowIndex: i + 2,
            contact: {
              name: rows[i][0] || '',
              email: rows[i][1] || '',
              notes: rows[i][2] || '',
              realEstate: rows[i][3] || '',
              phone: rows[i][4] || ''
            }
          });
        }
      }
      
      if (matches.length === 0) {
        const error = new Error(`Contact not found: ${name}`);
        error.code = 'CONTACT_NOT_FOUND';
        error.statusCode = 404;
        throw error;
      }
      
      if (matches.length > 1) {
        // Multiple matches - cannot delete ambiguously
        const error = new Error(`Found ${matches.length} contacts with name "${name}". Please provide email to disambiguate.`);
        error.code = 'AMBIGUOUS_DELETE';
        error.statusCode = 409;
        error.candidates = matches.map(m => m.contact);
        throw error;
      }
      
      // Single match - use it
      rowIndex = matches[0].rowIndex;
      deletedContact = matches[0].contact;
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
        requests: [{
          deleteDimension: {
            range: {
              sheetId: 0,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }]
      }
    });

    return { success: true, deleted: deletedContact };

  } catch (error) {
    if (error.code === 'CONTACT_NOT_FOUND' || error.code === 'AMBIGUOUS_DELETE') {
      throw error;
    }
    console.error('❌ [SHEETS_ERROR] Failed to delete contact');
    throw error;
  }
}

/**
 * Find duplicate contacts
 */
async function findDuplicates(accessToken) {
  try {
    const sheets = await getSheetsClient(accessToken);
    const spreadsheetId = await getOrCreateContactsSheet(accessToken);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONTACTS_RANGE,
    });

    const rows = response.data.values || [];
    const emailMap = {};

    for (let i = 0; i < rows.length; i++) {
      const email = (rows[i][1] || '').toLowerCase().trim();
      if (email) {
        if (!emailMap[email]) emailMap[email] = [];
        emailMap[email].push({
          name: rows[i][0] || '',
          email: rows[i][1] || '',
          notes: rows[i][2] || '',
          realestate: rows[i][3] || '',
          phone: rows[i][4] || '',
          rowIndex: i + 2
        });
      }
    }

    const duplicates = Object.values(emailMap)
      .filter(group => group.length > 1)
      .sort((a, b) => b.length - a.length);

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
