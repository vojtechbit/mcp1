# Quick Reference - New Endpoints & Features

## New Endpoints

### Mail Batch Operations
```
POST /mail/batchPreview
Body: { ids: ["id1", "id2"], kind: "summary"|"snippet"|"metadata" }

POST /mail/batchRead
Body: { ids: ["id1", "id2"] }
```

### Contacts Bulk Operations
```
POST /contacts/bulkUpsert
Body: { contacts: [{ name, email, notes?, realEstate?, phone? }] }

POST /contacts/bulkDelete
Body: { emails: ["email1", "email2"] } OR { rowIds: [2, 3, 4] }

GET /contacts/address-suggest?query=john
Returns: Top 3 fuzzy-matched addresses
```

## Enhanced Endpoints

### Mail Search
```
GET /api/gmail/search?query=test&aggregate=true&include=summary&normalizeQuery=true&relative=today&snapshotToken=...

Query Parameters:
- aggregate=true         → paginate internally until cap
- include=summary        → fetch summaries for all IDs
- normalizeQuery=true    → normalize query (diacritics, aliases)
- relative=today|tomorrow|thisWeek|lastHour → relative time
- snapshotToken=...      → stable iteration
- maxResults=100         → page size (normal mode)
- pageToken=...          → pagination token
```

### Calendar Events
```
GET /api/calendar/events?aggregate=true&snapshotToken=...&maxResults=100&pageToken=...

Query Parameters:
- aggregate=true         → paginate internally until cap
- snapshotToken=...      → stable iteration
- maxResults=100         → page size
- pageToken=...          → pagination token
- timeMin / timeMax      → time range
```

### Tasks
```
GET /api/tasks?maxResults=100&page=1

Query Parameters:
- maxResults=100         → page size
- page=1                 → page number (client-side pagination)
```

### Send to Self
```
POST /api/gmail/send
Body: {
  "subject": "Test",
  "body": "Message",
  "toSelf": true,
  "confirmSelfSend": true  ← REQUIRED when toSelf=true
}

POST /api/gmail/reply/:messageId
Body: {
  "body": "Reply",
  "toSelf": true,
  "confirmSelfSend": true  ← REQUIRED when toSelf=true
}
```

## Response Structures

### Normal Pagination
```json
{
  "success": true,
  "items": [...],
  "hasMore": true,
  "nextPageToken": "token123"
}
```

### Aggregate Mode
```json
{
  "success": true,
  "items": [...],
  "totalExact": 1234,
  "pagesConsumed": 15,
  "hasMore": false,
  "partial": false,
  "snapshotToken": "snap456"
}
```

### Mail Search with Summary
```json
{
  "success": true,
  "items": [
    {
      "id": "msg123",
      "threadId": "thread456",
      "summary": {
        "from": "sender@example.com",
        "subject": "Subject",
        "internalDate": "2025-10-17T10:00:00Z"
      }
    }
  ],
  "idsReturned": 50,
  "summariesReturned": 50,
  "hasMore": true,
  "nextPageToken": "..."
}
```

### Contacts with Duplicates
```json
{
  "success": true,
  "contact": {
    "name": "John Doe",
    "email": "john@example.com",
    "notes": "",
    "realEstate": "Villa Praha",
    "phone": "+420123456789"
  },
  "duplicates": [
    {
      "rowIndex": 5,
      "name": "John Doe",
      "email": "john@example.com",
      "notes": "Old note",
      "realEstate": "",
      "phone": ""
    }
  ],
  "note": "Duplicate email(s) detected..."
}
```

## ETag Caching

### Client Usage
```http
# First request
GET /api/contacts
→ Response: ETag: "abc123..."

# Subsequent request
GET /api/contacts
If-None-Match: "abc123..."
→ Response: 304 Not Modified (if unchanged)
```

## Rate Limits

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Standard | 600 requests | 15 min |
| Heavy (aggregate, batch, bulk) | 150 requests | 15 min |

## Environment Variables

```bash
# Single required ENV variable
REQUEST_BUDGET_15M=600  # Default: 600

# All other limits derived automatically:
# - RL_MAX_PER_IP = 600
# - RL_MAX_HEAVY_PER_IP = 150
# - PAGE_SIZE_DEFAULT = 100
# - PAGE_SIZE_MAX = 200
# - BATCH_PREVIEW_MAX_IDS = 200
# - BATCH_READ_MAX_IDS = 50
# - AGGREGATE_CAP_MAIL = 2000
# - AGGREGATE_CAP_CAL = 4000
```

## Contacts Sheet Structure

**Required columns (A-E):**
```
A: Name
B: Email
C: Notes
D: RealEstate  ← RENAMED from "Property"
E: Phone
```

**Range used:** `A2:E` (no hard row limit)

## Common Workflows

### 1. Search with Summary
```bash
# Get emails from today with summaries
GET /api/gmail/search?relative=today&include=summary
```

### 2. Aggregate All Events
```bash
# Get all calendar events in range
GET /api/calendar/events?timeMin=2025-10-01&timeMax=2025-10-31&aggregate=true
```

### 3. Batch Preview Multiple Emails
```bash
POST /mail/batchPreview
{
  "ids": ["msg1", "msg2", "msg3", ...],
  "kind": "summary"
}
```

### 4. Send to Self (Testing)
```bash
POST /api/gmail/send
{
  "subject": "Test Message",
  "body": "Testing send-to-self feature",
  "toSelf": true,
  "confirmSelfSend": true
}
```

### 5. Find Contact Address
```bash
GET /contacts/address-suggest?query=john
→ Returns top 3 fuzzy matches with scores
```

### 6. Bulk Import Contacts
```bash
POST /contacts/bulkUpsert
{
  "contacts": [
    {"name": "John", "email": "john@example.com", "realEstate": "Villa"},
    {"name": "Jane", "email": "jane@example.com", "phone": "+420123"}
  ]
}
```

## Error Handling

All endpoints return consistent error format:
```json
{
  "error": "Error Type",
  "message": "Detailed error message",
  "code": "ERROR_CODE"
}
```

Common error codes:
- `AUTH_REQUIRED` (401) - Session expired
- `CONFIRM_SELF_SEND_REQUIRED` (400) - Missing confirmSelfSend
- `CONTACT_NOT_FOUND` (404) - Contact doesn't exist
- `CONTACT_EXISTS` (409) - Duplicate contact (legacy, now returns duplicates array)

## Testing Checklist

- [ ] Test aggregate mode with mail search
- [ ] Test include=summary with mail search
- [ ] Test normalizeQuery with diacritics
- [ ] Test relative time queries (today, tomorrow, thisWeek, lastHour)
- [ ] Test batch preview and batch read
- [ ] Test send-to-self (should fail without confirmSelfSend)
- [ ] Test address suggestions
- [ ] Test bulk upsert contacts (check for duplicates array)
- [ ] Test bulk delete contacts
- [ ] Test ETag caching (304 responses)
- [ ] Verify contacts sheet uses realEstate column
- [ ] Test rate limiting (standard vs heavy)
- [ ] Test snapshot tokens for stable iteration
- [ ] Test pagination (hasMore, nextPageToken)

---

**Last Updated**: October 17, 2025  
**Version**: 2.0.0
