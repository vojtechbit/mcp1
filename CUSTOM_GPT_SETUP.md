# 🎯 Custom GPT OAuth Setup Guide

Complete guide for configuring your Custom GPT to use the MCP1 OAuth Proxy Server.

---

## 📋 **Prerequisites**

✅ Server deployed on Render.com (or similar)  
✅ MongoDB Atlas connected  
✅ Google OAuth credentials configured  
✅ `.env` file with `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`

---

## 🔐 **Step 1: Generate OAuth Client Secret**

Run this command to generate a secure client secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to your `.env` file:

```bash
OAUTH_CLIENT_ID=mcp1-oauth-client
OAUTH_CLIENT_SECRET=<your-generated-secret-here>
```

**Deploy the changes to Render.com!**

---

## 🤖 **Step 2: Configure Custom GPT Authentication**

### **In ChatGPT GPT Editor:**

1. Go to **Authentication** section
2. Select **OAuth**
3. Fill in the following fields:

#### **Client ID:**
```
mcp1-oauth-client
```

#### **Client Secret:**
```
<paste-your-generated-secret-from-env>
```

#### **Authorization URL:**
```
https://mcp1-oauth-server.onrender.com/oauth/authorize
```

#### **Token URL:**
```
https://mcp1-oauth-server.onrender.com/oauth/token
```

#### **Scope:**
```
gmail calendar
```

#### **Token Exchange Method:**
```
Default (POST request)
```

---

## 📝 **Step 3: Add Actions to Your GPT**

### **Example Action Schema:**

```yaml
openapi: 3.1.0
info:
  title: Gmail & Calendar API
  description: Access Gmail and Google Calendar via OAuth
  version: 1.0.0
servers:
  - url: https://mcp1-oauth-server.onrender.com
paths:
  /api/gmail/send:
    post:
      operationId: sendEmail
      summary: Send an email
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                to:
                  type: string
                  description: Recipient email address
                subject:
                  type: string
                  description: Email subject
                body:
                  type: string
                  description: Email body
              required:
                - to
                - subject
                - body
      responses:
        '200':
          description: Email sent successfully
          
  /api/gmail/search:
    get:
      operationId: searchEmails
      summary: Search emails
      parameters:
        - name: query
          in: query
          required: true
          schema:
            type: string
          description: Gmail search query
        - name: maxResults
          in: query
          schema:
            type: integer
            default: 10
      responses:
        '200':
          description: Search results
          
  /api/calendar/events:
    post:
      operationId: createCalendarEvent
      summary: Create a calendar event
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                summary:
                  type: string
                  description: Event title
                start:
                  type: string
                  description: Start time (ISO 8601)
                end:
                  type: string
                  description: End time (ISO 8601)
                description:
                  type: string
                location:
                  type: string
                attendees:
                  type: array
                  items:
                    type: string
                  description: List of attendee email addresses
              required:
                - summary
                - start
                - end
      responses:
        '200':
          description: Event created successfully
          
    get:
      operationId: listCalendarEvents
      summary: List calendar events
      parameters:
        - name: timeMin
          in: query
          schema:
            type: string
          description: Start time filter (ISO 8601)
        - name: timeMax
          in: query
          schema:
            type: string
          description: End time filter (ISO 8601)
        - name: maxResults
          in: query
          schema:
            type: integer
            default: 10
      responses:
        '200':
          description: List of events
```

---

## 🧪 **Step 4: Test the OAuth Flow**

### **Test in ChatGPT:**

1. Send a message: **"Send an email to test@example.com"**
2. You should see: **"Sign in to mcp1-oauth-server.onrender.com"**
3. Click the **Sign in** button
4. Authorize with Google
5. Return to ChatGPT
6. Email should be sent! ✅

### **Check Server Logs:**

```bash
# On Render.com, check logs for:
✅ User authenticated via proxy token: user@example.com
📧 Sending email to test@example.com...
✅ Email sent successfully
```

---

## 🔍 **Troubleshooting**

### **Error: "Invalid client credentials"**

❌ **Problem:** Client ID or Secret mismatch  
✅ **Solution:** Verify `.env` variables match GPT configuration

### **Error: "Invalid redirect_uri"**

❌ **Problem:** ChatGPT callback URL not whitelisted  
✅ **Solution:** Check that callback URL is in the format:  
`https://chat.openai.com/aip/g-{YOUR-GPT-ID}/oauth/callback`

### **Error: "Authorization code expired"**

❌ **Problem:** Auth code expired (>10 minutes)  
✅ **Solution:** Complete the flow faster, or increase timeout in `proxyTokenService.js`

### **Token expired messages:**

❌ **Problem:** Proxy token expired (>30 days)  
✅ **Solution:** User will need to re-authenticate (this is normal)

---

## 📊 **OAuth Flow Diagram**

```
User in ChatGPT
      ↓
"Send email" → ChatGPT detects action needs auth
      ↓
ChatGPT shows "Sign in" button
      ↓
User clicks → Redirect to /oauth/authorize
      ↓
Server redirects to Google OAuth
      ↓
User authorizes with Google
      ↓
Google redirects to /oauth/callback
      ↓
Server generates auth_code → saves to MongoDB
      ↓
Server redirects to ChatGPT with auth_code
      ↓
ChatGPT calls /oauth/token with auth_code
      ↓
Server generates proxy_token → saves to MongoDB
      ↓
Server returns proxy_token to ChatGPT
      ↓
ChatGPT stores proxy_token
      ↓
All future API calls use proxy_token
      ↓
Server validates proxy_token → finds user → calls Gmail/Calendar API
      ↓
✅ SUCCESS!
```

---

## 🎯 **Environment Variables Reference**

```bash
# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=845095283...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
REDIRECT_URI=https://mcp1-oauth-server.onrender.com/oauth/callback

# OAuth Proxy (for ChatGPT)
OAUTH_CLIENT_ID=mcp1-oauth-client
OAUTH_CLIENT_SECRET=<64-char-hex-string>

# Encryption & Database
ENCRYPTION_KEY=<64-char-hex-string>
MONGODB_URI=mongodb+srv://...

# Server
PORT=10000
NODE_ENV=production
```

---

## ✅ **Success Indicators**

You'll know it's working when:

1. ✅ User can click "Sign in" in ChatGPT
2. ✅ Redirect to Google OAuth works
3. ✅ After authorization, user returns to ChatGPT
4. ✅ Actions work without re-authentication
5. ✅ Server logs show "proxy token" authentication

---

## 🚀 **You're Done!**

Your Custom GPT can now:
- 📧 Send, read, search emails
- 📅 Create, list, update calendar events
- 🔐 Multi-user support (each user has their own tokens)
- 🔄 Long-lived access (30 days without re-auth)

**Enjoy your Gmail & Calendar powered GPT! 🎉**
