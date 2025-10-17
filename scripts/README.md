# MCP1 Acceptance Tests

## acceptance.sh

Comprehensive end-to-end acceptance test script that verifies all backend features.

### Prerequisites

- Server must be running (local or deployed)
- `jq` must be installed (`brew install jq` on macOS)
- Valid authentication token/session

### Usage

```bash
# Run against local server (default)
./scripts/acceptance.sh

# Run against deployed server
BASE_URL=https://your-server.onrender.com/api ./scripts/acceptance.sh
```

### Test Coverage

1. **ETag Support** - Verifies 304 Not Modified responses
2. **Snapshot Tokens** - Tests stable iteration across pages
3. **Aggregate Mode** - Validates totalExact, pagesConsumed, partial, hasMore fields
4. **Mail Summaries** - Tests include=summary with correct field counts
5. **Batch Operations** - Verifies batchPreview and batchRead endpoints
6. **Normalize & Relative Time** - Tests normalizeQuery and relative time parsing
7. **Contacts Bulk** - Tests bulkUpsert and bulkDelete operations
8. **Address Suggestions** - Verifies fuzzy matching with ≤3 results
9. **Calendar Conflicts** - Tests checkConflicts with force parameter

### Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

### Notes

- Some tests require actual data (emails, contacts) to execute fully
- Tests create temporary calendar events and contacts, then clean them up
- The script will stop on the first failure for easier debugging
