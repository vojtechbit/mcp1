# Changelog

All notable changes to MCP1 OAuth Server will be documented in this file.

## [2.1.0] - 2025-10-18

### 🚀 Backend Finalization - Complete

Major backend enhancements for consistency, stability, and advanced features.

#### New Features

##### ETag / 304 Support
- Added ETag caching for all GET list/detail endpoints
- Returns 304 Not Modified when client sends matching If-None-Match header
- Reduces bandwidth and improves performance
- Supported on: Mail search/read, Calendar list/get, Contacts list/search

##### Snapshot Tokens
- Unified snapshot token system with 120-second TTL
- Ensures stable membership and ordering during pagination
- In-memory storage with automatic cleanup
- Available on: Mail search, Calendar list (aggregate mode)

##### Normalize & Relative Time
- Query normalization: strips diacritics, alias expansion, safe escaping
- Relative time support: today, tomorrow, thisWeek, lastHour
- Reference timezone: Europe/Prague
- Usage: ?normalizeQuery=true&relative=today

##### Contacts Bulk Operations
- POST /contacts/bulkUpsert - append multiple contacts, report duplicates
- POST /contacts/bulkDelete - delete by emails or rowIds
- Heavy rate limiter applied for resource-intensive operations
- Fixed range: A2:E (Name | Email | Notes | RealEstate | Phone)

##### Address Suggestions
- GET /contacts/address-suggest?query=...
- Fuzzy matching using Jaro-Winkler similarity
- Returns up to 3 canonical suggestions with scores
- Optimized for assistant use with small payloads

##### Calendar Conflict Detection
- New parameters: checkConflicts, force
- Detects overlapping events before create/update
- Returns 409 with conflict details if force=false
- Creates event with conflict info if force=true
- Uses events.list with singleEvents=true, orderBy=startTime

##### Response Field Coherence
- Standardized all list/search endpoints
- Required fields: success, items, hasMore, nextPageToken
- Aggregate mode adds: totalExact, pagesConsumed, partial, snapshotToken
- Mail summaries add: idsReturned, summariesReturned, summariesPartial

#### Testing

##### Acceptance Script
- Added comprehensive end-to-end test script: scripts/acceptance.sh
- Tests all 9 feature categories
- Clear PASS/FAIL output with colors
- Executable bash script using jq for JSON parsing
- Configurable base URL via environment variable
- Automatically cleans up test data

#### Documentation
- Added IMPLEMENTATION_FINAL.md with complete implementation details
- Added scripts/README.md with test documentation
- Updated main README.md with new features

### 📝 Notes
- All changes backward compatible
- No breaking changes
- No new ENV variables required
- Uses existing REQUEST_BUDGET_15M for all derived limits

## [Unreleased] - 2025-10-12

### 🚨 BREAKING CHANGES
- **Gmail Search API:** Now returns `count` field (accurate count) alongside `resultSizeEstimate` (Gmail's estimate). Use `count` for accurate result counting.
- **Contacts API:** `POST /api/contacts` now returns `409 Conflict` if email already exists, instead of silently creating duplicates.

### ✨ Features

#### Privacy Policy - Complete GDPR Compliance
- Updated Privacy Policy with full GDPR compliance (EU 2016/679)
- Added Czech Act No. 110/2019 Coll. compliance
- Detailed description of ALL features:
  - 📧 Gmail operations (8 operations: send, read, search, reply, draft, delete, star, mark read/unread)
  - 📅 Calendar operations (5 operations: create, read, list, update, delete)
  - ✅ Tasks operations (5 operations: list, create, update, complete, delete)
  - 👥 Contacts/Sheets operations (6 operations: search, list, add, update, find sheet, create sheet)
- Both Czech (primary) and English versions
- Complete legal sections:
  - GDPR Articles 5, 6, 13, 14, 15-22, 28, 33-34, 46, 77
  - Data retention table
  - International data transfers (EU-US DPF, SCCs)
  - Third-party services table
  - ÚOOÚ contact information
- User-friendly design with color-coded sections

#### Duplicate Contact Prevention
- **New:** Automatic email duplication check in `addContact`
- Returns `409 Conflict` with existing contact information if email already exists
- Includes helpful error message:
  ```json
  {
    "error": "Contact already exists",
    "code": "CONTACT_EXISTS",
    "existingContact": { "name": "...", "email": "...", "notes": "..." },
    "suggestion": "Use the update contact endpoint to modify..."
  }
  ```

### 🐛 Bug Fixes

#### Gmail Search Result Count
- **Fixed:** Inaccurate result counting using `resultSizeEstimate`
- **New:** Added `count` field with actual number of results returned
- **Added:** Warning note when estimate differs from actual count
- Example response:
  ```json
  {
    "count": 10,  // ← Use this (accurate)
    "resultSizeEstimate": 201,  // ← Gmail's estimate (often wrong)
    "note": "Note: resultSizeEstimate is Gmail's estimate..."
  }
  ```

#### Contact Duplicates
- **Fixed:** Silent creation of duplicate contacts with same email
- **Added:** Pre-insertion check for existing emails
- **Added:** Case-insensitive and whitespace-trimmed email comparison

### 🎨 Improvements

#### Contacts Service (`contactsService.js`)
- Added email existence check before insertion
- Improved error handling with specific error codes
- Better logging with conflict detection

#### Contacts Controller (`contactsController.js`)
- Special handling for `CONTACT_EXISTS` error (409)
- Returns existing contact information for user decision
- Actionable suggestions in error messages

#### Gmail Controller (`gmailController.js`)
- Accurate result counting with `count` field
- Preserved `resultSizeEstimate` for backward compatibility
- Dynamic note field when counts differ

#### GPT Instructions (Custom GPT)
- **New:** Intelligent multi-query search strategy
- **New:** Automatic diacritics handling (Matyáš → Matyas OR Matyáš)
- **New:** Smart fallback to last 15 emails when nothing found
- **New:** Relevance scoring for fallback results
- **New:** Contact duplicate prevention workflow
- **New:** Step-by-step search examples

### 📝 Documentation
- Added comprehensive CHANGELOG.md
- Updated Privacy Policy with complete feature documentation
- Enhanced error messages with actionable suggestions

---

## Files Changed

### Modified
- `src/routes/privacyRoutes.js` - Complete rewrite with GDPR compliance
- `src/services/contactsService.js` - Added duplicate check in `addContact()`
- `src/controllers/contactsController.js` - Added 409 error handling
- `src/controllers/gmailController.js` - Added accurate `count` field

### Added
- `CHANGELOG.md` - This file

---

## Migration Guide

### For API Consumers

#### Gmail Search
**Before:**
```javascript
const result = await fetch('/api/gmail/search?query=test');
const count = result.resultSizeEstimate; // ⚠️ Often inaccurate
```

**After:**
```javascript
const result = await fetch('/api/gmail/search?query=test');
const count = result.count; // ✅ Accurate count
// result.resultSizeEstimate still available for compatibility
```

#### Contact Creation
**Before:**
```javascript
// Would create duplicate if email exists
POST /api/contacts { name: "Jan", email: "jan@example.com" }
// → 200 OK (duplicate created)
```

**After:**
```javascript
POST /api/contacts { name: "Jan", email: "jan@example.com" }
// → 409 Conflict if email exists
// {
//   "code": "CONTACT_EXISTS",
//   "existingContact": {...}
// }

// Use PUT to update instead:
PUT /api/contacts { name: "Jan", email: "jan@example.com", notes: "..." }
```

### For GPT Instructions

Update Custom GPT instructions to:
1. Use `count` instead of `resultSizeEstimate` for Gmail search
2. Check for existing contacts before adding (handle 409 response)
3. Implement multi-query search strategy with diacritics
4. Add fallback to recent emails when search returns no results

---

## Testing Checklist

- [ ] Test duplicate contact prevention
- [ ] Test Gmail search with accurate count
- [ ] Test intelligent search with diacritics (Matyáš → Matyas)
- [ ] Test fallback to recent emails
- [ ] Test Privacy Policy rendering (Czech + English)
- [ ] Test 409 Conflict error handling

---

## Known Issues
None at this time.

---

## Future Considerations
- Consider adding full-text search in emails (beyond Gmail query syntax)
- Consider caching recent email metadata for faster fallback searches
- Consider adding contact merge functionality for handling duplicates
- Consider adding batch contact operations
