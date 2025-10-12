#!/bin/bash

echo "🔍 Checking git status..."
git status

echo ""
echo "📦 Adding all changes..."
git add .

echo ""
echo "💾 Creating commit..."
git commit -m "fix: correct imports in all routes (authenticateUser -> verifyToken)

- Fixed debugRoutes.js to import verifyToken instead of authenticateUser
- This was causing SyntaxError on Render deployment
- All routes now correctly import from authMiddleware.js"

echo ""
echo "🚀 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Done! Render will auto-deploy from GitHub."
echo "⏳ Wait 2-3 minutes for Render to rebuild and deploy."
