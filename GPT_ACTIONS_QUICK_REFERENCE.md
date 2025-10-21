# 🤖 GPT Custom Actions - Nové Email Funkce

## ⚡ Quick Reference

### 3 nové způsoby jak číst emaily:

#### 1. **Snippet** (Nejrychlejší - doporučeno pro preview)
```
GET /api/gmail/snippet/{messageId}
```
**Kdy použít:** Když chceš rychle zkontrolovat obsah emailu
**Vrací:** Snippet, headers, velikost (vždy malá response)

#### 2. **Read s formátem** (Flexibilní)
```
GET /api/gmail/read/{messageId}?format=snippet
GET /api/gmail/read/{messageId}?format=metadata
GET /api/gmail/read/{messageId}?format=full
```
**Kdy použít:** Když potřebuješ specifický formát
**Vrací:** Podle zvoleného formátu

#### 3. **Read default** (Automatická ochrana)
```
GET /api/gmail/read/{messageId}
```
**Kdy použít:** Standardní čtení emailu
**Vrací:** Plný email, ale automaticky zkrácen pokud > 100KB

---

## 🎯 Doporučený workflow pro GPT

### Pro normální emaily:
```
1. Uživatel: "Přečti email abc123"
2. GPT → readEmail (default)
3. GPT → Zobrazí obsah
```

### Pro velké emaily (podezřelé newslettery):
```
1. Uživatel: "Přečti email abc123"
2. GPT → getEmailSnippet
3. GPT zkontroluje: sizeEstimate > 100000?
4a. Pokud ANO:
    - GPT: "Email je velký (250 KB), načítám zkrácenou verzi..."
    - GPT → readEmail (dostane zkrácenou verzi)
    - GPT: "Email zkrácen, zobrazuji prvních 8000 znaků..."
4b. Pokud NE:
    - GPT → readEmail
    - GPT → Zobrazí celý obsah
```

---

## 📊 Response struktury

### Snippet Response:
```json
{
  "success": true,
  "snippet": "Email preview text...",
  "sizeEstimate": 150000,
  "messageId": "abc123"
}
```

### Normal Read (malý email):
```json
{
  "success": true,
  "message": { /* full email */ },
  "truncated": false
}
```

### Truncated Read (velký email):
```json
{
  "success": true,
  "message": {
    "bodyPreview": "Truncated text...",
    "truncated": true,
    "truncationInfo": {
      "originalSize": 250000,
      "maxAllowedSize": 100000
    }
  },
  "truncated": true,
  "note": "Email byl zkrácen..."
}
```

---

## ⚙️ Parametry

### format (query parameter)
- `full` - Plný email (default)
- `metadata` - Jen headers
- `snippet` - Jen náhled
- `minimal` - Minimální info

### autoTruncate (query parameter)
- `true` - Auto zkrátit velké emaily (default)
- `false` - Nezkracovat (může být příliš velké!)

---

## 🚨 Co když GPT dostane chybu?

### "Email byl zkrácen"
→ Normální, email byl > 100KB
→ GPT by měl informovat uživatele
→ Zobrazit zkrácenou verzi

### "Email je velký"
→ Warning, email je 50-100KB
→ Může trvat déle
→ Pokračovat normálně

---

## 📝 Pro aktualizaci GPT Actions

1. Nahraď OpenAPI schema novým z `openapi-schema.json`
2. GPT automaticky dostane nové funkce:
   - `getEmailSnippet`
   - Updated `readEmail` s parametry
3. Otestuj s velkým emailem

---

## 💡 Best Practices

✅ **DĚJ:**
- Používej `getEmailSnippet` pro preview
- Informuj uživatele když je email zkrácen
- Používej format parametr pro optimalizaci

❌ **NEDĚJ:**
- Nevolej `readEmail` s `autoTruncate=false` bez důvodu
- Neočekávej plný obsah u velkých emailů
- Nezapomeň zkontrolovat `truncated` flag

---

## 🌐 API Endpoints & Enhancements

### Mail Batch Operations
```
POST /mail/batchPreview
Body: { ids: ["id1", "id2"], kind: "summary"|"snippet"|"metadata" }

POST /mail/batchRead
Body: { ids: ["id1", "id2"] }
```

### Contacts Bulk Operations
```
POST /contacts/bulkUpsert
Body: { contacts: [{ name, email, notes?, realEstate?, phone? }] }

POST /contacts/bulkDelete
Body: { emails: ["email1", "email2"] } OR { rowIds: [2, 3, 4] }

GET /contacts/address-suggest?query=john
Returns: Top 3 fuzzy-matched addresses
```

### Enhanced Search & Calendar Queries
```
GET /api/gmail/search?query=test&aggregate=true&include=summary&normalizeQuery=true&relative=today&snapshotToken=...
GET /api/calendar/events?aggregate=true&snapshotToken=...&maxResults=100&pageToken=...
GET /api/tasks?maxResults=100&page=1
```
- `aggregate=true` → interní stránkování do limitu
- `include=summary` → vrací summary pro všechny ID
- `normalizeQuery=true` → normalizuje diakritiku a aliasy
- `relative=today|tomorrow|thisWeek|lastHour` → relativní čas
- `snapshotToken=...` → stabilní iterace (mail, calendar)
- `maxResults` / `pageToken` → kontrola stránkování

### Send to Self (s potvrzením)
```
POST /api/gmail/send
{
  "subject": "Test",
  "body": "Message",
  "toSelf": true,
  "confirmSelfSend": true
}

POST /api/gmail/reply/:messageId
{
  "body": "Reply",
  "toSelf": true,
  "confirmSelfSend": true
}
```

---

## 📦 Response Patterns

### Standard Pagination
```json
{
  "success": true,
  "items": [...],
  "hasMore": true,
  "nextPageToken": "token123"
}
```

### Aggregate Mode
```json
{
  "success": true,
  "items": [...],
  "totalExact": 1234,
  "pagesConsumed": 15,
  "hasMore": false,
  "partial": false,
  "snapshotToken": "snap456"
}
```

### Mail Search se summary
```json
{
  "success": true,
  "items": [
    {
      "id": "msg123",
      "threadId": "thread456",
      "summary": {
        "from": "sender@example.com",
        "subject": "Subject",
        "internalDate": "2025-10-17T10:00:00Z"
      }
    }
  ],
  "idsReturned": 50,
  "summariesReturned": 50,
  "hasMore": true,
  "nextPageToken": "..."
}
```

### Contacts Duplicate Detection
```json
{
  "success": true,
  "contact": {
    "name": "John Doe",
    "email": "john@example.com",
    "notes": "",
    "realEstate": "Villa Praha",
    "phone": "+420123456789"
  },
  "duplicates": [
    {
      "rowIndex": 5,
      "name": "John Doe",
      "email": "john@example.com",
      "notes": "Old note",
      "realEstate": "",
      "phone": ""
    }
  ],
  "note": "Duplicate email(s) detected..."
}
```

---

## ♻️ ETag Caching Workflow
```
# First request
GET /api/contacts
→ Response: ETag: "abc123..."

# Subsequent request
GET /api/contacts
If-None-Match: "abc123..."
→ Response: 304 Not Modified (if unchanged)
```

---

## 🚦 Rate Limits & Environment

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Standard | 600 requests | 15 min |
| Heavy (aggregate, batch, bulk) | 150 requests | 15 min |

Single required ENV:
```
REQUEST_BUDGET_15M=600  # default
```
Derived automatically:
- RL_MAX_PER_IP = 600
- RL_MAX_HEAVY_PER_IP = 150
- PAGE_SIZE_DEFAULT = 100
- PAGE_SIZE_MAX = 200
- BATCH_PREVIEW_MAX_IDS = 200
- BATCH_READ_MAX_IDS = 50
- AGGREGATE_CAP_MAIL = 2000
- AGGREGATE_CAP_CAL = 4000

---

## 📋 Contacts Sheet Structure
```
A: Name
B: Email
C: Notes
D: RealEstate  ← dříve "Property"
E: Phone
```
Rozsah: `A2:E` (bez pevného limitu řádků)

---

## 🔁 Common Workflows
- **Search with summary:** `GET /api/gmail/search?relative=today&include=summary`
- **Aggregate calendar events:** `GET /api/calendar/events?timeMin=2025-10-01&timeMax=2025-10-31&aggregate=true`
- **Batch preview emails:** `POST /mail/batchPreview` s `kind="summary"`
- **Send to self (testování):** `POST /api/gmail/send` s `confirmSelfSend=true`
- **Find contact address:** `GET /contacts/address-suggest?query=john`
- **Bulk import contacts:** `POST /contacts/bulkUpsert` s více záznamy

---

## 🧰 Error Handling & Checklist

### Standard error payload
```json
{
  "error": "Error Type",
  "message": "Detailed error message",
  "code": "ERROR_CODE"
}
```

Časté kódy:
- `AUTH_REQUIRED` (401)
- `CONFIRM_SELF_SEND_REQUIRED` (400)
- `CONTACT_NOT_FOUND` (404)
- `CONTACT_EXISTS` (409)

### Testovací checklist
- [ ] Aggregate mode + mail search
- [ ] `include=summary` responses
- [ ] `normalizeQuery` s diakritikou
- [ ] Relativní časy (today, tomorrow, thisWeek, lastHour)
- [ ] Batch preview & batch read
- [ ] Send-to-self (selže bez confirmSelfSend)
- [ ] Address suggestions
- [ ] Bulk upsert + duplicates array
- [ ] Bulk delete
- [ ] ETag caching (304 responses)
- [ ] Rate limiting (standard vs heavy)
- [ ] Snapshot tokens pro stabilní iteraci
- [ ] Pagination (`hasMore`, `nextPageToken`)

---

**Status:** ✅ Ready to use  
**Tested:** ✅ Yes  
**Documentation:** See EMAIL_SIZE_HANDLING_UPDATE.md
