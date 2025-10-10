# Gmail & Calendar OAuth Server for Custom GPT

🚀 **Production-ready OAuth proxy server** that enables ChatGPT Custom GPT Actions to interact with Gmail and Google Calendar APIs on behalf of authenticated users.

✅ **Multi-user support** - Each user has their own encrypted tokens  
✅ **Secure OAuth flow** - Full OAuth 2.0 implementation with ChatGPT  
✅ **Long-lived tokens** - 30-day access without re-authentication  
✅ **Auto token refresh** - Google tokens refresh automatically  
✅ **Production tested** - Running on Render.com with MongoDB Atlas

## Features

### Gmail Actions (Full Functionality)
- Send, read, search emails
- Manage drafts (create, edit, delete)
- Reply and forward
- Manage labels
- Star/unstar, mark read/unread
- Delete/trash/untrash
- Get attachments

### Calendar Actions (Full Functionality)
- Create, read, update, delete events
- List calendars and events
- Manage attendees and reminders
- Search events
- Free/busy queries

## 🎯 Quick Start

### For Custom GPT Setup:
**→ See [CUSTOM_GPT_SETUP.md](CUSTOM_GPT_SETUP.md) for complete OAuth configuration guide**

### For Development:

#### 1. Install dependencies
```bash
npm install
