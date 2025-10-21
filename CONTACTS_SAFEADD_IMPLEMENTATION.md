# contactsSafeAdd - FIX IMPLEMENTATION

## Problem Found
- `contactsSafeAdd` v facadeService.js pracuje s **Google Contacts API**
- Ale contactsService.js pracuje s **Google Sheets**
- Formáty se liší! Google Contacts má `connections`, `phoneNumbers`, apod
- Google Sheets má jednoduché `{name, email, notes, realEstate, phone, rowIndex}`

## Solution
Přepsat contactsSafeAdd aby:
1. Volal `contactsService.listAllContacts()` (vrátí všechny z Sheets)
2. Porovnal entries s existing kontakty (match by email/name)
3. Vrátil confirm token pokud strategie='ask'
4. Jinak přímo provedu akci (create/skip/merge)

## Code Replace Needed

Najít v `src/services/facadeService.js`:

```javascript
// ==================== CONTACTS MACROS ====================

/**
 * Safe Add Contacts - with deduplication workflow
 * ...
export async function contactsSafeAdd(googleSub, params) {
  const { entries, dedupeStrategy = 'ask' } = params;
  // ... ENTIRE FUNCTION ... (najít až ke konci performContactsUpsert)
```

A **NAHRADIT** touto implementací:

```javascript
// ==================== CONTACTS MACROS ====================

/**
 * Safe Add Contacts - with deduplication detection
 * 
 * WORKFLOW:
 * 1. Get all existing contacts from Sheet
 * 2. For each new entry, check for duplicates by email/name
 * 3. If duplicates found AND dedupeStrategy='ask' → ask user
 * 4. Otherwise → add according to strategy (create/skip/merge)
 * 
 * NOTE: Works with Google Sheets storage (not Google Contacts API)
 * Contact format: {name, email, notes, realEstate, phone}
 */
export async function contactsSafeAdd(googleSub, params) {
  const { entries, dedupeStrategy = 'ask' } = params;

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    const error = new Error('entries parameter required: array of {name, email, phone?, notes?, realEstate?}');
    error.statusCode = 400;
    throw error;
  }

  // ========== STEP 1: Get all existing contacts from Sheet ==========
  
  let existingContacts = [];
  try {
    existingContacts = await contactsService.listAllContacts(googleSub);
  } catch (error) {
    console.warn('Failed to list existing contacts:', error.message);
    existingContacts = [];
  }

  // ========== STEP 2: Find duplicates for each entry ==========

  const duplicateFindings = [];

  for (const entry of entries) {
    const entryEmail = (entry.email || '').toLowerCase().trim();
    const entryName = (entry.name || '').toLowerCase().trim();

    // Find duplicates in existing contacts
    const candidates = existingContacts.filter(contact => {
      const contactEmail = (contact.email || '').toLowerCase().trim();
      const contactName = (contact.name || '').toLowerCase().trim();

      // Match by email (highest confidence)
      if (entryEmail && contactEmail && entryEmail === contactEmail) {
        return true;
      }

      // Match by name (lower confidence)
      if (entryName && contactName && entryName === contactName) {
        return true;
      }

      // Partial match
      if (entryName && contactName) {
        const entryParts = entryName.split(/\s+/);
        const contactParts = contactName.split(/\s+/);
        const commonParts = entryParts.filter(p => contactParts.includes(p));
        if (commonParts.length > 0 && commonParts.length === Math.min(entryParts.length, contactParts.length)) {
          return true;
        }
      }

      return false;
    });

    duplicateFindings.push({
      entry,
      candidates: candidates.map(c => ({
        ...c,
        rowIndex: c.rowIndex
      }))
    });
  }

  // ========== STEP 3: Check if any duplicates found ==========

  const hasAnyDuplicates = duplicateFindings.some(f => f.candidates.length > 0);

  // ========== STEP 4: Handle dedupeStrategy ==========

  if (hasAnyDuplicates && dedupeStrategy === 'ask') {
    // Return pending confirmation
    const confirmation = await createPendingConfirmation(
      googleSub,
      'deduplication',
      {
        operation: 'contacts.safeAdd',
        entriesToAdd: entries,
        duplicateFindings
      }
    );

    return {
      created: [],
      merged: [],
      skipped: duplicateFindings
        .filter(f => f.candidates.length > 0)
        .map(f => ({
          email: f.entry.email,
          name: f.entry.name,
          reason: `Found ${f.candidates.length} existing contact(s)`,
          existing: f.candidates
        })),
      confirmToken: confirmation.confirmToken,
      warnings: [
        `Found potential duplicates for ${duplicateFindings.filter(f => f.candidates.length > 0).length}/${entries.length}`,
        'Call /api/macros/confirm with action: create (add all), skip (skip duplicates), or merge'
      ]
    };
  }

  // ========== STEP 5: Perform bulk operation based on strategy ==========

  return await performContactsBulkAdd(
    googleSub,
    entries,
    duplicateFindings,
    dedupeStrategy
  );
}

/**
 * Complete deduplication workflow (after user confirms)
 */
export async function completeContactsDeduplication(
  googleSub,
  confirmToken,
  action // 'create', 'skip', or 'merge'
) {
  const confirmation = await getPendingConfirmation(confirmToken);

  if (!confirmation) {
    const error = new Error('Confirmation expired or not found');
    error.statusCode = 400;
    throw error;
  }

  if (confirmation.type !== 'deduplication') {
    throw new Error('Invalid confirmation type');
  }

  const { entriesToAdd, duplicateFindings } = confirmation.data;
  
  const result = await performContactsBulkAdd(
    googleSub,
    entriesToAdd,
    duplicateFindings,
    action
  );

  await completePendingConfirmation(confirmToken);

  return result;
}

/**
 * Perform bulk add with specified strategy
 * Strategy: 'create' = always add, 'skip' = skip duplicates, 'merge' = merge into existing
 */
async function performContactsBulkAdd(
  googleSub,
  entries,
  duplicateFindings,
  strategy
) {
  const result = {
    created: [],
    merged: [],
    skipped: []
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const finding = duplicateFindings[i];

    // If no duplicates or strategy='create' → ADD
    if (finding.candidates.length === 0 || strategy === 'create') {
      try {
        const created = await contactsService.addContact(googleSub, entry);
        result.created.push({
          name: entry.name,
          email: entry.email
        });
      } catch (error) {
        console.error(`Failed to add contact ${entry.name}:`, error.message);
        result.skipped.push({
          email: entry.email,
          name: entry.name,
          reason: `Add failed: ${error.message}`
        });
      }
    }
    // If duplicates exist and strategy='skip' → SKIP
    else if (strategy === 'skip') {
      result.skipped.push({
        email: entry.email,
        name: entry.name,
        reason: `Skipped: ${finding.candidates.length} duplicate(s)`,
        existing: finding.candidates
      });
    }
    // If duplicates exist and strategy='merge' → MERGE
    else if (strategy === 'merge' && finding.candidates.length > 0) {
      const existingContact = finding.candidates[0];
      
      try {
        // Merge: update existing contact with new data (don't override old)
        const merged = await contactsService.updateContact(googleSub, {
          name: existingContact.name, // Keep existing name
          email: existingContact.email, // Keep existing email
          phone: entry.phone || existingContact.phone, // Use new if provided
          notes: entry.notes || existingContact.notes,
          realEstate: entry.realEstate || existingContact.realEstate
        });
        
        result.merged.push({
          merged_into: existingContact.email,
          from: entry.name,
          fields_updated: Object.keys(entry).filter(k => entry[k] && !existingContact[k])
        });
      } catch (error) {
        console.error(`Failed to merge contact ${entry.name}:`, error.message);
        result.skipped.push({
          email: entry.email,
          name: entry.name,
          reason: `Merge failed: ${error.message}`
        });
      }
    }
  }

  return result;
}
```

## Then Remove Old Function
Find and REMOVE the old `performContactsUpsert` function (it uses wrong API)
Lines should be around ~ contact helpers section

## Export
Make sure facadeService.js exports both:
```javascript
export { contactsSafeAdd, completeContactsDeduplication }
```
