import { google } from 'googleapis';
import { refreshAccessToken } from '../config/oauth.js';
import dotenv from 'dotenv';
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';

dotenv.config();

/**
 * Contacts Service - Google Sheets Storage
 * 
 * ✅ SHEETS ONLY - NO MONGODB
 * All contact data is stored in Google Sheets.
 * Authentication tokens are passed from caller (controller/RPC).
 * 
 * STRUCTURE: Name | Email | Phone | RealEstate | Notes
 */

const CONTACTS_SHEET_NAME = 'MCP1 Contacts';
const CONTACTS_RANGE = 'A2:E';
const CONTACTS_EXPECTED_HEADERS = ['Name', 'Email', 'Phone', 'RealEstate', 'Notes'];
const GPT_RETRY_EXAMPLE_EMAIL = 'alex@example.com';

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
    const primarySheet = createResponse.data.sheets?.[0]?.properties || {};
    const sheetId = primarySheet.sheetId;

    // Add header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1:E1',
      valueInputOption: 'RAW',
      requestBody: { values: [CONTACTS_EXPECTED_HEADERS] }
    });

    // Make header bold
    if (typeof sheetId === 'number') {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: 'userEnteredFormat.textFormat.bold'
            }
          }]
        }
      });
    }

    console.log(`✅ Contact sheet created: ${spreadsheetId}`);
    return { spreadsheetId, sheetId, sheetTitle: primarySheet.title };

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
    const created = await createContactsSheet(accessToken);
    spreadsheetId = created.spreadsheetId;
  }
  return spreadsheetId;
}

function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeHeaderValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isContactsHeaderRow(row) {
  if (!Array.isArray(row)) return false;
  if (row.length < 2) return false;
  const normalized = row.map(normalizeHeaderValue);
  return normalized[0] === 'name' && normalized[1] === 'email';
}

function quoteSheetTitleForRange(title) {
  const safeTitle = String(title ?? '').replace(/'/g, "''");
  return `'${safeTitle}'`;
}

async function getContactsSheetInfo(accessToken) {
  const sheets = await getSheetsClient(accessToken);
  const spreadsheetId = await getOrCreateContactsSheet(accessToken);

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title,index))'
  });

  const sheetsMeta = spreadsheet.data.sheets || [];
  if (sheetsMeta.length === 0) {
    throw buildContactsSheetMismatchError(
      new Error('Contacts spreadsheet is missing worksheets'),
      { reason: 'NO_WORKSHEETS', spreadsheetId, operation: 'contacts.resolveSheet' }
    );
  }

  const ranges = sheetsMeta.map(sheet => `${quoteSheetTitleForRange(sheet.properties?.title ?? '')}!A1:E1`);
  const headerRows = new Map();

  if (ranges.length > 0) {
    const headerResponse = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges
    });

    const valueRanges = headerResponse.data?.valueRanges || [];
    valueRanges.forEach((range, index) => {
      if (!headerRows.has(index)) {
        headerRows.set(index, range.values?.[0] || null);
      }
    });
  }

  let matchedIndex = -1;
  for (let i = 0; i < sheetsMeta.length; i++) {
    const headerRow = headerRows.get(i);
    if (headerRow && isContactsHeaderRow(headerRow)) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1) {
    matchedIndex = sheetsMeta.findIndex(sheet => sheet.properties?.index === 0);
  }

  if (matchedIndex === -1) matchedIndex = 0;

  const matchedSheet = sheetsMeta[matchedIndex];
  const detectedHeaders = headerRows.get(matchedIndex) || null;

  return {
    spreadsheetId,
    sheetId: matchedSheet.properties?.sheetId,
    sheetTitle: matchedSheet.properties?.title,
    detectedHeaders
  };
}

function isMissingGridError(error) {
  if (!error) return false;
  const directMessage = typeof error.message === 'string' ? error.message : '';
  if (directMessage.includes('No grid with id')) return true;

  const errorList = Array.isArray(error.errors) ? error.errors : [];
  if (errorList.some(item => typeof item?.message === 'string' && item.message.includes('No grid with id'))) {
    return true;
  }

  const responseMessage = error.response?.data?.error?.message;
  if (typeof responseMessage === 'string' && responseMessage.includes('No grid with id')) {
    return true;
  }

  const rootMessage = error.response?.data?.message;
  if (typeof rootMessage === 'string' && rootMessage.includes('No grid with id')) {
    return true;
  }

  return false;
}

function buildContactsSheetMismatchError(originalError, context = {}) {
  const error = new Error('Contacts worksheet is missing or does not match the expected structure');
  error.name = 'ContactsSheetMismatchError';
  error.statusCode = context.statusCode || 409;
  error.code = 'CONTACTS_SHEET_MISMATCH';

  const details = {
    reason: context.reason || 'TARGET_WORKSHEET_MISSING',
    spreadsheetId: context.spreadsheetId,
    attemptedSheetId: context.sheetId,
    sheetTitle: context.sheetTitle,
    expectedHeaders: CONTACTS_EXPECTED_HEADERS,
    suggestedNextSteps: [
      {
        type: 'retry',
        description: 'Retry the delete operation with a verified contact email address.',
        request: { op: context.retryOp || 'contactsDelete', body: { email: GPT_RETRY_EXAMPLE_EMAIL } }
      },
      {
        type: 'fallback',
        description: 'Run the contacts dedupe macro to merge duplicate rows before retrying delete.',
        request: { op: 'dedupe' }
      }
    ],
    originalError: originalError?.message || String(originalError)
  };

  if (context.operation) {
    details.operation = context.operation;
  }

  if (context.detectedHeaders && Array.isArray(context.detectedHeaders)) {
    details.detectedHeaders = context.detectedHeaders;
  }

  error.details = details;
  error.cause = originalError;
  return error;
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
        const phone = (row[2] || '').toLowerCase();
        const realEstate = (row[3] || '').toLowerCase();
        const notes = (row[4] || '').toLowerCase();
        return name.includes(query) || email.includes(query) ||
               phone.includes(query) || realEstate.includes(query) ||
               notes.includes(query);
      })
      .map(row => ({
        name: row[0] || '',
        email: row[1] || '',
        phone: row[2] || '',
        realEstate: row[3] || '',
        notes: row[4] || ''
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
      phone: row[2] || '',
      realEstate: row[3] || '',
      notes: row[4] || ''
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
        phone: row[2] || '',
        realEstate: row[3] || '',
        notes: row[4] || ''
      }));

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[name, email, phone || '', realEstate || '', notes || '']]
      }
    });

    const result = { name, email, phone: phone || '', realEstate: realEstate || '', notes: notes || '' };
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
          phone: row[2] || '',
          realEstate: row[3] || '',
          notes: row[4] || ''
        });
      }
    });

    const newRows = contacts.map(c => [
      c.name || '',
      c.email || '',
      c.phone || '',
      c.realEstate || '',
      c.notes || ''
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
  let sheetInfo;
  try {
    const sheets = await getSheetsClient(accessToken);
    sheetInfo = await getContactsSheetInfo(accessToken);
    const { spreadsheetId, sheetId, sheetTitle, detectedHeaders } = sheetInfo;

    if (typeof sheetId !== 'number') {
      throw buildContactsSheetMismatchError(new Error('Missing sheet identifier'), {
        reason: 'MISSING_SHEET_ID',
        spreadsheetId,
        sheetId,
        sheetTitle,
        detectedHeaders,
        operation: 'contacts.bulkDelete'
      });
    }

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

    if (rowsToDelete.length === 0) {
      return {
        deleted: 0,
        skipped: {
          reason: 'NO_MATCHING_ROWS',
          attemptedEmails: Array.isArray(emails) ? emails : undefined,
          attemptedRowIds: Array.isArray(rowIds) ? rowIds : undefined,
          suggestedNextSteps: [
            {
              type: 'search',
              description: 'Search contacts first to confirm the stored email or row before retrying bulk delete.',
              request: { op: 'contactsSearch', query: 'alex' }
            },
            {
              type: 'fallback',
              description: 'Fallback to dedupe to merge duplicates before deleting.',
              request: { op: 'dedupe' }
            }
          ]
        }
      };
    }

    console.log(`📊 Deleting rows: ${rowsToDelete.join(', ')}`);
    rowsToDelete.sort((a, b) => b - a);

    const requests = rowsToDelete.map(rowIndex => ({
      deleteDimension: {
        range: {
          sheetId,
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
    if (error.code === 'CONTACTS_SHEET_MISMATCH') {
      throw error;
    }
    if (isMissingGridError(error)) {
      console.error('❌ [SHEETS_ERROR] Contacts worksheet mismatch during bulk delete');
      throw buildContactsSheetMismatchError(error, {
        operation: 'contacts.bulkDelete',
        spreadsheetId: sheetInfo?.spreadsheetId,
        sheetId: sheetInfo?.sheetId,
        sheetTitle: sheetInfo?.sheetTitle,
        detectedHeaders: sheetInfo?.detectedHeaders
      });
    }
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
        values: [[name, email, phone || '', realEstate || '', notes || '']]
      }
    });

    return { name, email, phone: phone || '', realEstate: realEstate || '', notes: notes || '' };

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
  let sheetInfo;
  try {
    if (!email && !name) {
      const error = new Error('Must provide either email or name');
      error.statusCode = 400;
      error.code = 'INVALID_IDENTIFIER';
      error.details = {
        required: ['email', 'name'],
        suggestedNextSteps: [
          {
            type: 'retry',
            description: 'Retry with a contact email that exists in the Google Sheet.',
            request: { op: 'contactsDelete', body: { email: GPT_RETRY_EXAMPLE_EMAIL } }
          }
        ]
      };
      throw error;
    }

    const sheets = await getSheetsClient(accessToken);
    sheetInfo = await getContactsSheetInfo(accessToken);
    const { spreadsheetId, sheetId, sheetTitle, detectedHeaders } = sheetInfo;

    if (typeof sheetId !== 'number') {
      throw buildContactsSheetMismatchError(new Error('Missing sheet identifier'), {
        reason: 'MISSING_SHEET_ID',
        spreadsheetId,
        sheetId,
        sheetTitle,
        detectedHeaders,
        operation: 'contacts.deleteContact'
      });
    }

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
            phone: rows[i][2] || '',
            realEstate: rows[i][3] || '',
            notes: rows[i][4] || ''
          };
          break;
        }
      }
    } else {
      // NAME ONLY MODE: Find by name
      const nameToFind = name.toLowerCase().trim();
      const matches = [];
      const searchHint = (name || '').trim().slice(0, 3) || 'alex';

      for (let i = 0; i < rows.length; i++) {
        const rowName = (rows[i][0] || '').toLowerCase().trim();
        if (rowName === nameToFind) {
          matches.push({
            rowIndex: i + 2,
            contact: {
              name: rows[i][0] || '',
              email: rows[i][1] || '',
              phone: rows[i][2] || '',
              realEstate: rows[i][3] || '',
              notes: rows[i][4] || ''
            }
          });
        }
      }

      if (matches.length === 0) {
        const error = new Error(`Contact not found: ${name}`);
        error.code = 'CONTACT_NOT_FOUND';
        error.statusCode = 404;
        error.details = {
          attemptedIdentifiers: { name },
          suggestedNextSteps: [
            {
              type: 'search',
              description: 'Search contacts to find the matching email before deleting.',
              request: { op: 'contactsSearch', query: searchHint }
            },
            {
              type: 'retry',
              description: 'Retry delete with the exact email returned by the search.',
              request: { op: 'contactsDelete', body: { email: GPT_RETRY_EXAMPLE_EMAIL } }
            }
          ]
        };
        throw error;
      }

      if (matches.length > 1) {
        // Multiple matches - cannot delete ambiguously
        const error = new Error(`Found ${matches.length} contacts with name "${name}". Please provide email to disambiguate.`);
        error.code = 'AMBIGUOUS_DELETE';
        error.statusCode = 409;
        error.candidates = matches.map(m => m.contact);
        error.details = {
          candidates: matches.map(m => m.contact),
          suggestedNextSteps: [
            {
              type: 'retry',
              description: 'Retry delete using the precise email of the desired contact.',
              request: { op: 'contactsDelete', body: { email: GPT_RETRY_EXAMPLE_EMAIL } }
            }
          ]
        };
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
      error.details = {
        attemptedIdentifiers: {
          email: email || null,
          name: name || null
        },
        suggestedNextSteps: [
          {
            type: 'search',
            description: 'Search contacts to confirm the exact stored email before retrying delete.',
            request: { op: 'contactsSearch', query: 'alex' }
          },
          {
            type: 'retry',
            description: 'Retry delete with the confirmed email value.',
            request: { op: 'contactsDelete', body: { email: GPT_RETRY_EXAMPLE_EMAIL } }
          }
        ]
      };
      throw error;
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }]
      }
    });

    return {
      success: true,
      deleted: deletedContact,
      deletedRowIndex: rowIndex,
      sheet: { spreadsheetId, sheetId }
    };

  } catch (error) {
    if (error.code === 'CONTACT_NOT_FOUND' || error.code === 'AMBIGUOUS_DELETE') {
      throw error;
    }
    if (error.code === 'CONTACTS_SHEET_MISMATCH') {
      throw error;
    }
    if (isMissingGridError(error)) {
      console.error('❌ [SHEETS_ERROR] Contacts worksheet mismatch during delete');
      throw buildContactsSheetMismatchError(error, {
        operation: 'contacts.deleteContact',
        spreadsheetId: sheetInfo?.spreadsheetId,
        sheetId: sheetInfo?.sheetId,
        sheetTitle: sheetInfo?.sheetTitle,
        detectedHeaders: sheetInfo?.detectedHeaders
      });
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
          phone: rows[i][2] || '',
          realestate: rows[i][3] || '',
          notes: rows[i][4] || '',
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

const traced = wrapModuleFunctions('services.contactsService', {
  searchContacts,
  getAddressSuggestions,
  listAllContacts,
  addContact,
  bulkUpsert,
  bulkDelete,
  updateContact,
  deleteContact,
  findDuplicates,
});

const {
  searchContacts: tracedSearchContacts,
  getAddressSuggestions: tracedGetAddressSuggestions,
  listAllContacts: tracedListAllContacts,
  addContact: tracedAddContact,
  bulkUpsert: tracedBulkUpsert,
  bulkDelete: tracedBulkDelete,
  updateContact: tracedUpdateContact,
  deleteContact: tracedDeleteContact,
  findDuplicates: tracedFindDuplicates,
} = traced;

export {
  tracedSearchContacts as searchContacts,
  tracedGetAddressSuggestions as getAddressSuggestions,
  tracedListAllContacts as listAllContacts,
  tracedAddContact as addContact,
  tracedBulkUpsert as bulkUpsert,
  tracedBulkDelete as bulkDelete,
  tracedUpdateContact as updateContact,
  tracedDeleteContact as deleteContact,
  tracedFindDuplicates as findDuplicates,
};
