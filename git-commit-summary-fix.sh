#!/bin/bash

cd /Users/vojtechbroucek/Desktop/mcp1

git add .

git commit -m "fix: include=summary and batchPreview now return full format (from, subject, date, snippet)

PROBLEM:
- include=summary returned only: id, internalDate
- batchPreview(kind:summary) returned only: id, internalDate
- Missing: from, subject, date (ISO), snippet

ROOT CAUSE:
1. googleApiService.js readEmail(format='metadata') returned raw Gmail API data
   without transforming headers → from, subject, date, snippet
2. gmailController.js fetchBatchPreview expected transformed fields that didn't exist

SOLUTION:
1. googleApiService.js (line 395-421):
   - Added header extraction and transformation
   - Parse 'From' header → from, fromEmail, fromName
   - Convert internalDate (ms) → date (ISO 8601)
   - Include snippet field
   
2. gmailController.js (line 273-281):
   - Changed internalDate → date
   - Added snippet field
   - Use transformed fields from readEmail

RESULT:
✅ Summary format now includes:
   - id
   - from (full 'Name <email>' format)
   - subject
   - date (ISO 8601 string)
   - snippet (Gmail preview)

FILES CHANGED:
- src/services/googleApiService.js (metadata transformation)
- src/controllers/gmailController.js (fetchBatchPreview fix)
- test-summary-fix.js (new test)
- SUMMARY_FORMAT_FIX.md (documentation)

TEST:
node test-summary-fix.js"

echo ""
echo "✅ Git commit připraven!"
echo ""
echo "Pro push použij:"
echo "  git push"
echo ""

chmod +x git-commit-summary-fix.sh
