# MCP1 Backend - Architecture & Developer Guide

> Kompletní průvodce serverem, API, jak věci fungují a jak je rozšiřovat.

---

## 🎯 Co je MCP1?

**OAuth proxy server** pro ChatGPT Custom GPT, který umožňuje asistentovi bezpečně přistupovat k:
- **Gmail** (čtení, psaní, hledání emailů)
- **Google Calendar** (vytváření schůzek, správa)
- **Google Tasks** (správa úkolů)
- **Google Contacts** (správa kontaktů)

Server běží na **Render** s MongoDB backend a vrací data ve formátu optimalizovaném pro GPT.

---

## 🏗️ Architecture

### Vrstvení

```
┌─────────────────────────────────┐
│   ChatGPT Custom GPT            │  (klient)
└──────────────┬──────────────────┘
               │ HTTPS (OAuth 2.0)
┌──────────────▼──────────────────┐
│   facadeService.js              │  HIGH-LEVEL MACROS
│   (inboxOverview, calendarPlan) │  (optimalizováno pro GPT)
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│   googleApiService.js           │  LOW-LEVEL FUNCTIONS
│   (readEmail, searchEmails...)  │  (surový Gmail/Calendar API)
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│   Google APIs                   │  (Gmail, Calendar, Contacts, Tasks)
│   + MongoDB                     │  + Database (tokens, users)
└─────────────────────────────────┘
```

### Klíčové adresáře

```
mcp1/
├── src/
│   ├── controllers/          # HTTP handlers (macroInboxOverview, etc.)
│   ├── services/
│   │   ├── googleApiService.js       # Low-level Gmail/Calendar API wrapping
│   │   ├── facadeService.js          # HIGH-LEVEL MACROS (co ChatGPT vidí)
│   │   ├── databaseService.js        # MongoDB operations
│   │   └── tokenService.js           # OAuth token management
│   ├── utils/
│   │   ├── helpers.js                # parseRelativeTime() - timezone handling
│   │   ├── signedUrlGenerator.js     # Signed URLs pro attachment downloads
│   │   ├── attachmentSecurity.js     # Blocked file detection
│   │   └── errorCatalog.js           # Central catalog of API error codes & statuses
│   ├── middleware/                   # Auth, rate limiting, etc.
│   ├── config/                       # OAuth, limits, constants
│   └── routes/                       # HTTP routes
├── openapi-facade-final.json         # API spec (co ChatGPT vidí)
├── package.json
└── .env                              # OAuth credentials, MongoDB URI
```

## 🧰 Error handling & katalog kódů

- `src/utils/errorCatalog.js` drží **jediný zdroj pravdy** pro všechny API `code` hodnoty (včetně popisu a výchozího HTTP statusu).
- `ApiError.from()` automaticky doplní status ze stejného katalogu, pokud kód zná.
- Test `test/errorCatalog.test.js` hlídá, že každá reference na `code`/`defaultCode` v repo odpovídá položce v katalogu – nové kódy je nutné přidat sem.
- Markdown tabulka `ERROR_CODE_CATALOG.md` se generuje přímo z katalogu a slouží jako rychlá reference pro tým.

### Custom GPT frontend assets

- `instructionsalfred.md` – **hlavní instrukce** nahrané přímo do Custom GPT. Určují chování asistenta (tone, povinné kroky, bezpečnost).
- `playbooksalfred.md` a `formattingalfred.md` – tvoří **knowledge base** dostupnou GPT v editoru; popisují operativní postupy a formát výstupů.
- `openapi-facade-final.json` – společně s výše uvedenými soubory definuje, co „front-end“ (Custom GPT) reálně umí. Backend může nabídnout jen to, co je zde popsané.
- Při návrhu nových funkcí vždy sladíme serverové změny s těmito třemi soubory, jinak se asistent k novinkám nedostane.

---

## 🔄 Data Flow - Příklad "Kdo mi psal dnes?"

### 1. ChatGPT volá endpoint
```http
POST /api/macros/inbox/overview
Content-Type: application/json

{
  "timeRange": { "relative": "today" },
  "maxItems": 50
}
```

### 2. Facade Layer orchestruje
```javascript
// src/services/facadeService.js - inboxOverview()

1. Sestav Gmail search query
   - timeRange: parseRelativeTime('today') → "after:1729202400 before:1729288799"
   - Tady se už bere Praha timezone!

2. Zavolej Gmail API - searchEmails()
   - Vrátí jen message IDs (nejrychlejší)

3. Batch fetch metadata pro všechny IDs
   - readEmail(id, {format: 'metadata'})
   - Vrátí: senderName, subject, date, labelIds

4. Aplikuj classification
   - classifyEmailCategory(msg) → mapuj labelIds na kategorii
   - CATEGORY_PERSONAL → 'primary'
   - CATEGORY_PROMOTIONS → 'promotions'

5. Vrať standardizované items ChatGPT
```

### 3. ChatGPT dostane odpověď
```json
{
  "items": [
    {
      "messageId": "18abc...",
      "senderName": "Render",
      "senderAddress": "no-reply@render.com",
      "subject": "deploy failed for mcp1-oauth-server",
      "receivedAt": "2025-10-19T23:47:00Z",
      "inboxCategory": "primary",
      "snippet": "We encountered an error during the deploy..."
    }
  ],
  "subset": false,
  "nextPageToken": null
}
```

---

## 🕐 Timezone Handling - KRITICKÉ!

**Reference timezone:** `Europe/Prague` (UTC+1 winter, UTC+2 summer)

### Jak to funguje

```javascript
// helpers.js - parseRelativeTime('today')

VSTUP:  relative='today'  (v Local browser time - nepotřebujeme vědět jaký čas je tam)
PROCES: Detekuj Prague time přes Intl API
        Prague local time: "2025-10-19 00:00:00" až "2025-10-19 23:59:59"
        Převeď na UTC: "2025-10-18 22:00:00" až "2025-10-19 21:59:59" (UTC+2 DST)
        Vrať jako Unix seconds: after=1729202400, before=1729288799
VÝSTUP: Gmail API query: "after:1729202400 before:1729288799"
VÝSLEDEK: Gmail filtruje v UTC, vrátí všechny emaily z "Prague today"
```

### FIX z 20.10.2025

**Problem:** `last7d` počítala v UTC, ne v Prague time → asymetrie

**Řešení:** Sjednoceno s ostatními filtry - teď všechny počítají od Prague midnight:
- `today` ✅
- `yesterday` ✅
- `thisWeek` ✅
- `last7d` ✅ (FIXED)
- `last24h` ✅

---

## 📨 Inbox Categories - FIXED

**Problem:** Všechny emaily se vracely jako `'other'`

**Řešení:** Přidána `classifyEmailCategory()` funkce:

```javascript
// googleApiService.js

function classifyEmailCategory(message) {
  const labelIds = message.labelIds || [];
  
  // Priority order
  if (hasLabel(labelIds, 'CATEGORY_PROMOTIONS')) return 'promotions';
  if (hasLabel(labelIds, 'CATEGORY_SOCIAL')) return 'social';
  if (hasLabel(labelIds, 'CATEGORY_UPDATES')) return 'updates';
  if (hasLabel(labelIds, 'CATEGORY_FORUMS')) return 'forums';
  if (hasLabel(labelIds, 'IMPORTANT')) return 'primary';
  if (hasLabel(labelIds, 'CATEGORY_PERSONAL')) return 'primary';
  if (containsLabel(labelIds, 'work')) return 'work';
  
  return 'other';
}
```

**Používá se v:** `facadeService.js - inboxOverview()` a `inboxSnippets()`

---

## 🔑 Klíčové Funkce

### Facade Macros (co ChatGPT vidí)

| Endpoint | Co dělá | Vrací |
|----------|---------|-------|
| `/macros/inbox/overview` | Lehký přehled emailů | senderName, subject, date, category |
| `/macros/inbox/snippets` | Overview + preview textu | ^ + snippet + attachment URLs |
| `/macros/email/quickRead` | Čtení konkrétních emailů | Plný obsah + přílohy |
| `/macros/calendar/plan` | Přehled dnešního/týdenního kalendáře | Všechny události s statusem |
| `/macros/calendar/schedule` | Vytvoření nové schůzky | Event ID |
| `/macros/contacts/safeAdd` | Přidání kontaktů s deduplikací | Created/merged/skipped count |

### RPC Operace (nízkoúrovňové)

- `POST /rpc/mail` - search, preview, read, createDraft, send, reply, modify
- `POST /rpc/calendar` - list, get, create, update, delete
- `POST /rpc/contacts` - list, search, add, dedupe, bulkUpsert, addressSuggest *(mutace přesměrovány)*
- `POST /contacts/actions/modify` / `/contacts/actions/delete` / `/contacts/actions/bulkDelete` - přímé mutace pro GPT bez RPC vrstvy
- `POST /rpc/tasks` - list (read-only). Mutace přesunuty na /tasks/actions/*
- `/tasks/actions/create` / `/tasks/actions/modify` / `/tasks/actions/delete` - přímé mutace pro GPT

---

## 🛡️ Bezpečnost

✅ **OAuth 2.0** - Uživatel se přihlašuje do Googlu, ne do nás  
✅ **AES-256-GCM** - Refresh tokeny šifrované v DB  
✅ **Rate Limiting** - 100 req/15 min  
✅ **TLS 1.3** - HTTPS encrypted  
✅ **Audit Logs** - 90 dní historii (kdo, co, kdy)  

**Token Management:**
```
Access token: Platný 1 hodinu, cachován v memory
             Když expiruje → auto refresh z refresh tokenu
Refresh token: Bezpečně uložen v MongoDB (AES-256 encrypted)
              Nikdy se nevystavuje klientovi
```

---

## 🚀 Jak přidat novou funkci

### Příklad: Nový endpoint "Vyprazdnit spam"

#### 1. Přidej low-level funkci do `googleApiService.js`

```javascript
async function emptySpam(googleSub) {
  return await handleGoogleApiCall(googleSub, async () => {
    const gmail = google.gmail({ version: 'v1', auth: authClient });
    
    // Najdi všechny emaily v SPAM labelId
    const results = await gmail.users.messages.list({
      userId: 'me',
      q: 'label:SPAM'
    });
    
    // Smažmě je
    if (results.data.messages) {
      for (const msg of results.data.messages) {
        await gmail.users.messages.delete({
          userId: 'me',
          id: msg.id
        });
      }
    }
    
    return { deleted: results.data.messages.length };
  });
}

// Export
export { emptySpam };
```

#### 2. Přidej macro do `facadeService.js`

```javascript
import { emptySpam } from './googleApiService.js';

export async function macroEmptySpam(googleSub) {
  return await emptySpam(googleSub);
}
```

#### 3. Přidej controller do `facadeController.js`

```javascript
export async function macroEmptySpam(req, res) {
  try {
    const result = await facadeService.macroEmptySpam(req.user.googleSub);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

#### 4. Přidej route do `routes/facade.js`

```javascript
router.post('/macros/email/emptySpam', authMiddleware, facadeController.macroEmptySpam);
```

#### 5. Aktualizuj OpenAPI spec `openapi-facade-final.json`

```json
"/macros/email/emptySpam": {
  "post": {
    "operationId": "macroEmptySpam",
    "summary": "Empty spam folder",
    "responses": {
      "200": {
        "schema": {
          "type": "object",
          "properties": { "deleted": { "type": "integer" } }
        }
      }
    }
  }
}
```

#### 6. Ready!

ChatGPT si nyní vůbec nemusí nic přidávat - Custom GPT si sama načte nový endpoint z OpenAPI spec!

---

## 🧪 Testování

```bash
# Test timezone parsing
node -e "import('./src/utils/helpers.js').then(h => console.log(h.parseRelativeTime('today')))"

# Test API endpoints (po spuštění serveru)
curl -X POST http://localhost:3000/api/macros/inbox/overview \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timeRange": {"relative": "today"}}'
```

---

## 📋 Deployment Checklist

```bash
# 1. Lokálně
npm install
cp .env.example .env
# Vyplň GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MONGODB_URI

# 2. Test
npm test

# 3. Git
git add .
git commit -m "feature: new feature..."
git push origin main

# 4. Render
# Server automaticky deployuje na https://mcp1-oauth-server.onrender.com

# 5. Verify
curl https://mcp1-oauth-server.onrender.com/health
```

---

## 📚 Relevantní Soubory

| Soubor | Účel |
|--------|------|
| `openapi-facade-final.json` | API spec - co ChatGPT vidí |
| `CUSTOM_GPT_SETUP.md` | Jak nastavit Custom GPT na ChatGPT.com |
| GPT editor | Aktuální prompt a quick actions (spravujeme mimo repo) |
| `CHANGELOG.md` | Verze history |
| `FIXES_APPLIED_20251020.md` | Nedávné bugfixy |
| `.env.example` | Template pro environment variables |

---

## ❓ FAQ

**Q: Jak přidám nový endpoint?**  
A: Viz "Jak přidat novou funkci" výše. 5 kroků.

**Q: Co když token expiruje?**  
A: Automatický refresh v `getValidAccessToken()` - uživatel to nevidí.

**Q: Jaký je limit pro počet emailů?**  
A: `maxItems` default 50-100 (závisí na endpointu), max 200.

**Q: Jak pracuje kategorizace emailů?**  
A: Mapuje Gmail labelIds (CATEGORY_PROMOTIONS, etc.) na kategorie (promotions, primary, etc.) přes `classifyEmailCategory()`.

**Q: Co se stane když ChatGPT zavolá neexistující endpoint?**  
A: 404 - Custom GPT to uvidí a informs uživatele.

---

**Last Updated:** October 20, 2025  
**Version:** 3.3 (Current)  
**Status:** Production Ready
