# Implementation Summary - Advanced Features

## Completed Implementation (October 2025)

This document summarizes all advanced features implemented according to the specification.

---

## ✅ 1. Minimal ENV + Derived Limits

**File**: `src/config/limits.js`

- Single ENV variable: `REQUEST_BUDGET_15M` (default 600)
- All limits derived at startup:
  - `RL_MAX_PER_IP = 600`
  - `RL_MAX_HEAVY_PER_IP = 150`
  - `PAGE_SIZE_DEFAULT = 100`
  - `PAGE_SIZE_MAX = 200`
  - `BATCH_PREVIEW_MAX_IDS = 200`
  - `BATCH_READ_MAX_IDS = 50`
  - `BATCH_READ_CONCURRENCY = 3`
  - `AGGREGATE_CAP_MAIL = 2000`
  - `AGGREGATE_CAP_CAL = 4000`
  - `RETRY_DELAYS_MS = [1000, 3000, 8000]`
- Reference timezone: `Europe/Prague`
- Snapshot TTL: 2 minutes
- Logged at startup for observability

---

## ✅ 2. Rate Limiting

**File**: `src/server.js`

- Standard routes: `RL_MAX_PER_IP` per 15 minutes
- Heavy routes: `RL_MAX_HEAVY_PER_IP` per 15 minutes
- Heavy routes include:
  - Any route with `aggregate=true`
  - `POST /mail/batchPreview`
  - `POST /mail/batchRead`
  - `POST /contacts/bulkUpsert`
  - `POST /contacts/bulkDelete`

---

## ✅ 3. Pagination + Aggregate Mode

**Affected**: Mail search, Calendar events list, Tasks list

**Files**: 
- `src/controllers/gmailController.js`
- `src/controllers/calendarController.js`
- `src/controllers/tasksController.js`

### Normal Mode (aggregate not set)
- Returns single page with `PAGE_SIZE_DEFAULT` or client-specified size (≤ `PAGE_SIZE_MAX`)
- Response includes:
  - `hasMore: boolean`
  - `nextPageToken: string` (when more pages exist)

### Aggregate Mode (aggregate=true)
- Server paginates internally until exhaustion or cap reached
- Response includes:
  - `items: array` - all collected items
  - `totalExact: number` - exact count
  - `pagesConsumed: number` - pages fetched
  - `hasMore: boolean` - more available beyond cap
  - `partial: boolean` - cap was hit
  - `snapshotToken: string` - for stable iteration

---

## ✅ 4. Snapshot Tokens

**File**: `src/utils/snapshotStore.js`

- In-memory storage with 2-minute TTL
- Provides stable view across paginated requests
- Auto-cleanup of expired tokens
- Used in aggregate mode for mail search and calendar events

---

## ✅ 5. Mail Search Enhancements

**File**: `src/controllers/gmailController.js`

### include=summary (OFF by default)
- When enabled, fetches summaries for ALL returned IDs
- Summary includes: `from`, `subject`, `internalDate`
- Internal batching with `BATCH_PREVIEW_MAX_IDS` and `BATCH_READ_CONCURRENCY`
- Response counters:
  - `idsReturned: number`
  - `summariesReturned: number`
  - `summariesPartial: boolean` (only if internal cap hit)

### normalizeQuery=true
- Strips diacritics
- Escapes unsafe characters
- Simple alias expansion (urgent, meeting, invoice)
- Returns `normalizedQuery` in response

### Relative Time Support
**File**: `src/utils/helpers.js`

Supported values with `Europe/Prague` timezone:
- `today` - start/end of today
- `tomorrow` - start/end of tomorrow
- `thisWeek` - Monday to Sunday of current week
- `lastHour` - last 60 minutes

Translates to concrete `after`/`before` timestamps before calling Google API.

---

## ✅ 6. Batch Endpoints for Mail

**File**: `src/controllers/gmailController.js`

### POST /mail/batchPreview
- Body: `{ ids: string[], kind: "summary"|"snippet"|"metadata" }`
- Enforces `BATCH_PREVIEW_MAX_IDS` (chunks internally if exceeded)
- Returns combined response with all items
- Response: `{ idsRequested, idsReturned, kind, items }`

### POST /mail/batchRead
- Body: `{ ids: string[] }`
- Enforces `BATCH_READ_MAX_IDS` (truncates if exceeded)
- Truncates body to 2000 characters per message
- Response: `{ idsRequested, idsReturned, items }`

### Auto-routing
- Single-read endpoint (`GET /api/gmail/read/:messageId`) auto-routes to batchRead if >5 comma-separated IDs provided
- Response includes `routed: "batch"` annotation

---

## ✅ 7. Read Email Enhancements

**File**: `src/controllers/gmailController.js`

All read email responses now include:
- `truncated: boolean` - true if server shortened body
- `sizeEstimate: number` - if available from API
- `webViewUrl: string` - direct link to message/thread

---

## ✅ 8. Uniform List Response Fields

**Applied to**: All list/search endpoints

Every list response includes:
- `hasMore: boolean`
- `nextPageToken: string` (when applicable)

When `aggregate=true`:
- `totalExact: number`
- `pagesConsumed: number`
- `partial: boolean`
- `snapshotToken: string`

---

## ✅ 9. ETag/304 Caching

**File**: `src/utils/helpers.js`

Functions:
- `computeETag(data)` - computes MD5 hash of response
- `checkETagMatch(requestETag, computedETag)` - validates match

Applied to:
- All GET list/detail endpoints
- Returns 304 Not Modified when ETag matches
- ETag sent via `ETag` response header
- Client sends via `If-None-Match` request header

---

## ✅ 10. Contacts (Google Sheets)

**Files**:
- `src/services/contactsService.js`
- `src/controllers/contactsController.js`

### Column Rename
- Old: `Name | Email | Notes | Property | Phone`
- New: `Name | Email | Notes | RealEstate | Phone`
- Uses fixed range: `A2:E` (no hard row cap)

### Always Append (No Auto-merge)
- On add or bulk upsert, always appends new rows
- Returns `duplicates` array when email already exists
- Assistant can suggest merge to user

### Bulk Operations

#### POST /contacts/bulkUpsert
- Body: `{ contacts: [{name, email, notes?, realEstate?, phone?}] }`
- Always appends (no auto-merge)
- Returns: `{ inserted, duplicates? }`

#### POST /contacts/bulkDelete
- Body: `{ emails: string[] }` OR `{ rowIds: number[] }`
- Batch deletion with single API call
- Returns: `{ deleted }`

---

## ✅ 11. Send-to-Self Behavior

**Files**: `src/controllers/gmailController.js`

### POST /api/gmail/send
- Parameters:
  - `toSelf: boolean` (default false)
  - `confirmSelfSend: boolean` - required when toSelf=true
- If `toSelf=true` and `confirmSelfSend=true`: sets `to = currentUser.primaryEmail`
- If explicit `to` provided, ignores `toSelf`
- Returns 400 if `toSelf=true` but `confirmSelfSend` not true

### POST /api/gmail/reply/:messageId
- Same behavior as send
- Requires `confirmSelfSend=true` when replying to self

---

## ✅ 12. Address Suggestions

**Files**:
- `src/services/contactsService.js`
- `src/controllers/contactsController.js`

### GET /contacts/address-suggest?query=...
- Returns up to 3 canonical address suggestions
- Fuzzy matching:
  - Diacritics stripped
  - Token-based matching
  - Jaro-Winkler similarity
- Response includes internal `_score` (not emphasized to user)
- Format: `{ success, count, suggestions: [{name, email, _score}] }`

---

## Out of Scope (Not Implemented)

As per specification:
- Delta listing / sync tokens
- Priority scoring
- Testing/CI changes

---

## Testing Recommendations

1. **ENV Configuration**
   ```bash
   # Test with default budget
   REQUEST_BUDGET_15M=600
   
   # Test with custom budget
   REQUEST_BUDGET_15M=1200
   ```

2. **Mail Search**
   ```bash
   # Normal pagination
   GET /api/gmail/search?query=test&maxResults=50
   
   # Aggregate mode
   GET /api/gmail/search?query=test&aggregate=true
   
   # With summary
   GET /api/gmail/search?query=test&include=summary
   
   # Normalized query
   GET /api/gmail/search?query=ůřřřřř&normalizeQuery=true
   
   # Relative time
   GET /api/gmail/search?query=&relative=today
   ```

3. **Batch Operations**
   ```bash
   # Batch preview
   POST /mail/batchPreview
   {
     "ids": ["msg1", "msg2", "msg3"],
     "kind": "summary"
   }
   
   # Batch read
   POST /mail/batchRead
   {
     "ids": ["msg1", "msg2"]
   }
   ```

4. **Send to Self**
   ```bash
   # Must include confirmSelfSend
   POST /api/gmail/send
   {
     "subject": "Test",
     "body": "Testing self-send",
     "toSelf": true,
     "confirmSelfSend": true
   }
   ```

5. **Contacts**
   ```bash
   # Address suggestions
   GET /contacts/address-suggest?query=john
   
   # Bulk upsert
   POST /contacts/bulkUpsert
   {
     "contacts": [
       {"name": "John Doe", "email": "john@example.com", "realEstate": "Villa Praha"}
     ]
   }
   
   # Bulk delete
   POST /contacts/bulkDelete
   {
     "emails": ["john@example.com", "jane@example.com"]
   }
   ```

6. **ETag Caching**
   ```bash
   # First request - returns ETag
   GET /api/contacts
   # Response includes: ETag: "abc123..."
   
   # Second request with ETag
   GET /api/contacts
   Headers: If-None-Match: "abc123..."
   # Returns 304 Not Modified if unchanged
   ```

---

## Configuration Summary

| Setting | Default | Derived From |
|---------|---------|--------------|
| REQUEST_BUDGET_15M | 600 | ENV |
| RL_MAX_PER_IP | 600 | REQUEST_BUDGET_15M |
| RL_MAX_HEAVY_PER_IP | 150 | REQUEST_BUDGET_15M / 4 |
| PAGE_SIZE_DEFAULT | 100 | min(100, REQUEST_BUDGET_15M / 6) |
| PAGE_SIZE_MAX | 200 | min(200, REQUEST_BUDGET_15M / 3) |
| BATCH_PREVIEW_MAX_IDS | 200 | min(200, floor(REQUEST_BUDGET_15M / 3)) |
| BATCH_READ_MAX_IDS | 50 | min(50, floor(REQUEST_BUDGET_15M / 12)) |
| BATCH_READ_CONCURRENCY | 3 | constant |
| AGGREGATE_CAP_MAIL | 2000 | constant |
| AGGREGATE_CAP_CAL | 4000 | constant |
| REFERENCE_TIMEZONE | Europe/Prague | constant |
| SNAPSHOT_TTL_MS | 120000 | constant (2 min) |

---

## Implementation Notes

- All changes maintain backward compatibility with existing endpoints
- Heavy operations automatically trigger heavy rate limiter
- Snapshot tokens expire after 2 minutes (auto-cleanup)
- ETag computation uses MD5 hash of stable response fields
- Contacts sheet now requires 5 columns (A-E): Name, Email, Notes, RealEstate, Phone
- Send-to-self requires explicit confirmation to prevent accidents
- Batch operations use internal chunking to respect limits
- All list endpoints return uniform response structure

---

**Implementation Date**: October 17, 2025  
**Status**: ✅ Complete  
**Version**: 2.0.0
