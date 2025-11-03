#!/bin/bash

set -e

cd /Users/vojtechbroucek/Desktop/mcp1

# Add all changes
git add .

echo "🧪 Running test suite before commit..."
npm test

# Commit with detailed message
git commit -m "feat: Complete advanced features implementation

Major features added:
- Minimal ENV config with derived limits from REQUEST_BUDGET_15M
- Rate limiting (standard + heavy for aggregate/batch/bulk)
- Pagination with aggregate mode (mail, calendar, tasks)
- Snapshot tokens for stable iteration (2min TTL)
- ETag/304 caching for all GET endpoints

Mail enhancements:
- include=summary (OFF by default, batched internally)
- normalizeQuery=true (diacritics, alias expansion)
- relative time (today/tomorrow/thisWeek/lastHour) using Unix timestamps
- Batch endpoints: batchPreview, batchRead with auto-routing
- Send-to-self with confirmSelfSend requirement

Contacts improvements:
- Renamed property → realEstate (columns A-E)
- Always append, never auto-merge
- Returns duplicates array for assistant suggestions
- Bulk operations: bulkUpsert, bulkDelete
- Address suggestions with fuzzy matching (Jaro-Winkler)

Fixes:
- Relative time now uses Unix timestamps for accurate timezone handling
- All dates converted to seconds since epoch for Gmail API compatibility
- Europe/Prague timezone properly handled

Files changed:
- src/config/limits.js - derived limits
- src/utils/helpers.js - Unix timestamp conversion for relative time
- src/services/contactsService.js - complete rewrite
- src/controllers/gmailController.js - complete rewrite
- src/controllers/calendarController.js - aggregate support
- src/controllers/tasksController.js - pagination + ETag
- src/controllers/contactsController.js - bulk ops + suggestions
- src/routes/apiRoutes.js - new endpoints

Docs added:
- IMPLEMENTATION_COMPLETE.md
- QUICK_REFERENCE.md
- READY_TO_USE.md"

echo "✅ Changes committed!"
