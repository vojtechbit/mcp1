# v3.2.0 Update Summary

## Critical Fixes
- ✅ **Summary response fixed**: Removed `snippet` from summary (now only from/subject/date per spec)
- ✅ **includeAttachments parameter**: Added to `/api/gmail/read` endpoint

## New Features Implemented

### Labels API (Full CRUD)
- List labels
- Modify message labels
- Modify thread labels
- Label filtering in search

### Thread Operations
- Get thread summary (participants, counts, last message)
- Mark thread read/unread
- Reply to thread

### Attachments Support
- Get attachment metadata
- Text preview (placeholder for PDF/TXT extraction)
- Table preview (placeholder for CSV/XLSX parsing)

## Implementation Status

✅ Service layer (googleApiService.js)
✅ Controller layer (gmailController.js)
✅ Routes (apiRoutes.js)
⏳ OpenAPI schema needs updating
⏳ Attachment libraries (pdfjs-dist, xlsx) not installed yet

## Testing Required

- [ ] Test label operations
- [ ] Test thread operations
- [ ] Test attachment metadata
- [ ] Test summary without snippet
- [ ] Test includeAttachments parameter

## Breaking Changes

None - all changes are additive or fixes to match spec.
