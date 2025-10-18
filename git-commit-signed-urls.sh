#!/bin/bash

# Git commit script for signed URLs implementation

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Staging changes..."
git add src/utils/signedUrlGenerator.js
git add src/services/googleApiService.js
git add src/controllers/gmailController.js
git add src/routes/apiRoutes.js
git add .env.example
git add SIGNED_URLS_IMPLEMENTATION.md

echo ""
echo "✍️ Creating commit..."
git commit -m "feat: implement signed URLs for attachment downloads

- Add signedUrlGenerator utility with HMAC-SHA256 signing
- Generate 15-minute expiring signed URLs for attachments
- Add /download endpoint for secure attachment downloads
- Update getAttachmentMeta to return downloadUrl and expiresAt
- Add BASE_URL configuration to .env.example
- Implement timing-safe signature verification
- Add comprehensive documentation

Security features:
- Time-limited URLs (15 min default)
- HMAC-SHA256 signatures
- No secrets exposed in URLs
- Replay protection via expiration

Fixes: downloadUrl and expiresAt now functional (previously null)
Version: 3.2.2"

echo ""
echo "✅ Commit created successfully!"
echo ""
echo "📤 To push changes, run:"
echo "   git push origin main"
