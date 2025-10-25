# Custom GPT Setup Guide

Rychlý návod jak nakonfigurovat Custom GPT s OAuth proxy.

---

## 1. Vygeneruj OAuth Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Přidej do `.env` a Render.com env variables:
```bash
OAUTH_CLIENT_ID=mcp1-oauth-client
OAUTH_CLIENT_SECRET=<tvůj-vygenerovaný-secret>
```

---

## 2. Deploy na Render

```bash
git add .
git commit -m "OAuth proxy ready"
git push origin main
```

Na Render.com přidej environment variables (včetně `OAUTH_CLIENT_SECRET`).

---

## 3. Nakonfiguruj Custom GPT

### V GPT Editoru:

**Authentication:**
- Typ: OAuth
- Client ID: `mcp1-oauth-client`
- Client Secret: `<stejný jako v .env>`
- Authorization URL: `https://mcp1-oauth-server.onrender.com/oauth/authorize`
- Token URL: `https://mcp1-oauth-server.onrender.com/oauth/token`
- Scope: `gmail calendar`

**Instructions:**
- Udržujeme je přímo v GPT editoru. Soubor `GPT_CONFIG.md` jsme odstranili, takže vezmi poslední schválenou verzi z produktové dokumentace nebo exportu z GPT editoru.

**Conversation Starters:**
- Stejný postup jako výše – spravuj je v GPT editoru (soubor s quick actions jsme z repozitáře odstranili).

> 📎 **Poznámka:** Quick actions ani starý prompt už v repozitáři nejsou. Pokud potřebuješ tahák, vytvoř si vlastní poznámky mimo repo, aby neovlivňovaly produkční konfiguraci.

**Privacy Policy:**
- URL: `https://mcp1-oauth-server.onrender.com/privacy-policy`

---

## 4. OpenAPI Schema

```yaml
openapi: 3.1.0
info:
  title: Gmail & Calendar API
  version: 1.0.0
servers:
  - url: https://mcp1-oauth-server.onrender.com

paths:
  /api/gmail/send:
    post:
      operationId: sendEmail
      summary: Send email
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                to:
                  type: string
                subject:
                  type: string
                body:
                  type: string
              required: [to, subject, body]

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
        - name: maxResults
          in: query
          schema:
            type: integer
            default: 10

  /api/gmail/read/{messageId}:
    get:
      operationId: readEmail
      summary: Read specific email
      parameters:
        - name: messageId
          in: path
          required: true
          schema:
            type: string

  /api/calendar/events:
    post:
      operationId: createEvent
      summary: Create calendar event
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                summary:
                  type: string
                start:
                  type: string
                  description: ISO 8601 datetime
                end:
                  type: string
                  description: ISO 8601 datetime
                location:
                  type: string
                attendees:
                  type: array
                  items:
                    type: string
              required: [summary, start, end]
    
    get:
      operationId: listEvents
      summary: List calendar events
      parameters:
        - name: timeMin
          in: query
          schema:
            type: string
        - name: timeMax
          in: query
          schema:
            type: string
        - name: maxResults
          in: query
          schema:
            type: integer
            default: 10
```

*(Přidej další endpointy podle potřeby)*

---

## 5. Test OAuth Flow

1. V ChatGPT: "Pošli email test@example.com"
2. Mělo by se objevit: "Sign in to mcp1-oauth-server.onrender.com"
3. Klikni → Google OAuth → Autorizuj
4. Vrať se do ChatGPT
5. Email by se měl poslat ✅

---

## Troubleshooting

**"Invalid client credentials"**
→ Zkontroluj že `OAUTH_CLIENT_SECRET` v .env = secret v GPT Editoru

**"Authorization code expired"**
→ Zkus OAuth flow znovu, code expiruje za 10 minut

**"Token expired"**
→ Normální po 30 dnech, user se musí znovu přihlásit

---

**Hotovo! 🚀**
