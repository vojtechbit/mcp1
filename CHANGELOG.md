# Changelog

All notable changes to MCP1 OAuth Server will be documented in this file.

## [3.2.1] - 2025-10-18

### 🔧 Hotfix - Production Deployment

Fixed critical issues preventing deployment on Render.

#### Bug Fixes

##### PDF Parse Import Error
- Fixed `pdf-parse` library import issue causing "ENOENT: test file not found" error
- Changed to dynamic import: `const pdfParse = (await import('pdf-parse')).default`
- Import now happens only when processing PDF files
- No performance impact, server starts successfully

##### Security Vulnerability Fix
- Replaced `xlsx@0.18.5` with `xlsx-js-style@1.2.0`
- Fixes high severity vulnerabilities:
  - Prototype Pollution (GHSA-4r6h-8v6p-xvw6)
  - Regular Expression Denial of Service (GHSA-5pgg-2g8v-p4x9)
- Drop-in replacement with same API
- Actively maintained fork with security patches

#### Technical Details
- pdf-parse bug: Library tries to load test PDF at import time
- Solution: Lazy loading via dynamic import
- xlsx vulnerabilities: No fix available in original package
- Solution: Switch to actively maintained fork

---

## [3.2.0] - 2025-10-18

### ✅ Attachment Processing Complete

Final implementation of attachment handling with full PDF and Excel support.

#### New Features

##### Dependencies Added
- **pdf-parse** v1.1.1 - PDF text extraction
- **xlsx** v0.18.5 - Excel spreadsheet processing

##### XLSX/XLS Preview (COMPLETE)
- Full implementation of Excel file preview
- Sheet selection by index or name
- Lists all available sheets
- Converts to JSON array format
- Handles empty cells gracefully
- Truncation support for large files
- Comprehensive error handling

##### CSV Preview (ENHANCED)
- Improved quote handling
- Better delimiter detection
- Empty file detection
- Consistent response format

#### Attachment Endpoints
- `GET /api/gmail/attachments/:messageId/:attachmentId` - Metadata
- `GET /api/gmail/attachments/:messageId/:attachmentId/text?maxKb=256` - Text preview (PDF, TXT, HTML)
- `GET /api/gmail/attachments/:messageId/:attachmentId/table?sheet=0&maxRows=50` - Table preview (CSV, XLSX)

#### Supported Formats
- **Text**: PDF, TXT, HTML
- **Tables**: CSV, XLSX, XLS
- Automatic MIME type and filename detection
- Configurable limits (maxKb, maxRows)

#### Security & Limits
- Max text preview: 2048 KB
- Max table rows: 500
- Automatic size validation
- Rate limiting applied

---

## [2.2.0] - 2025-10-18

### 🚀 Idempotency + Tasks Enhancement

Major features: Idempotency keys for all mutations and Tasks API with aggregate + snapshot support.

#### New Features

##### Idempotency Keys
- Added comprehensive idempotency support for all mutations (POST/PUT/PATCH/DELETE)
- Prevents duplicate execution with Idempotency-Key header or body.idempotency_key
- Fingerprint-based detection: SHA-256(method + path + canonical JSON)
- MongoDB storage with TTL (12 hours auto-cleanup)
- Behavior:
  - First occurrence: Execute and store result
  - Same fingerprint: Return stored result (no re-execution)
  - Different fingerprint with same key: 409 IDEMPOTENCY_KEY_REUSE_MISMATCH
- Applied to: Gmail send/reply/draft/star/read/delete, Calendar create/update/delete, Contacts bulk ops, Tasks create/update/delete
- Logging: HIT/MISS/CONFLICT with hashed keys for privacy

##### Tasks API - Aggregate Mode
- Added aggregate=true parameter for internal pagination
- Returns: totalExact, pagesConsumed, partial, hasMore
- Aggregate cap: AGGREGATE_CAP_TASKS (1000 tasks)
- Heavy rate limiter applied for aggregate mode

##### Tasks API - Snapshot Tokens
- Snapshot support with ~120s TTL for stable iteration
- Parameters: snapshotToken, ignoreSnapshot=true
- Guarantees consistent membership and ordering during pagination
- Returns snapshotToken in aggregate mode responses

##### Tasks API - Native Pagination
- Updated to use Google Tasks API nextPageToken
- Removed client-side pagination (now uses API native paging)
- Supports: maxResults, pageToken, showCompleted

#### Implementation Details

**New Files:**
- src/middleware/idempotencyMiddleware.js - Idempotency middleware

**Modified Files:**
- src/routes/apiRoutes.js - Applied idempotency middleware globally
- src/controllers/tasksController.js - Complete rewrite with aggregate + snapshot
- src/services/tasksService.js - Added listTasks() with native paging support
- src/config/limits.js - Added AGGREGATE_CAP_TASKS (1000)

**Database:**
- New collection: idempotency_records
- Unique index: (key, method, path)
- TTL index: createdAt (12 hours)

#### Email-Specific Behavior

- Each new send requires new Idempotency-Key
- Same recipient but different subject/body → new key (or 409)
- Retry with same key → returns original result, doesn't send again

#### API Examples

**Idempotency:**
```bash
# First request
POST /api/gmail/send
Idempotency-Key: msg-001
→ 200 OK + messageId

# Retry
POST /api/gmail/send  
Idempotency-Key: msg-001  
→ 200 OK + SAME messageId (not sent again)

# Different body, same key
→ 409 IDEMPOTENCY_KEY_REUSE_MISMATCH
```

**Tasks Aggregate:**
```bash
GET /api/tasks?aggregate=true
→ { totalExact, pagesConsumed, partial, snapshotToken }
```

**Tasks Snapshot:**
```bash
GET /api/tasks?snapshotToken=snap_xyz
→ Frozen data (consistent for ~2 minutes)
```

### 📝 Notes
- All changes backward compatible
- Idempotency is opt-in (key not required)
- Tasks aggregate/snapshot are opt-in
- No breaking changes
- Zero new ENV variables

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
