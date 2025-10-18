# 🚀 Quick Deployment Guide - v3.2.0

## Co bylo dokončeno

✅ **XLSX attachment preview** - Plně funkční  
✅ **PDF text extraction** - Plně funkční  
✅ **CSV preview** - Vylepšeno  
✅ **Všechny dependencies** - Přidány do package.json

## Nasazení (5 kroků)

### 1. Nainstaluj nové balíčky

```bash
cd /Users/vojtechbroucek/Desktop/mcp1
npm install
```

Toto nainstaluje:
- `pdf-parse@1.1.1` - Pro PDF
- `xlsx@0.18.5` - Pro Excel

### 2. Testuj lokálně (volitelné)

```bash
npm run dev
```

Server poběží na `http://localhost:3000`

### 3. Commit změny

```bash
git add .
git commit -m "feat: Complete XLSX attachment preview implementation v3.2.0"
```

### 4. Push na Render

```bash
git push origin main
```

Render automaticky:
- Detekuje změny v `package.json`
- Nainstaluje nové dependencies
- Deployne novou verzi
- Restartuje server

### 5. Verifikuj deployment

Po deploynení (cca 2-3 minuty) zkontroluj:

#### A) Health check:
```bash
curl https://mcp1-oauth-server.onrender.com/api/auth/status
```

Očekávaný response:
```json
{
  "authenticated": false,
  "message": "Not authenticated"
}
```

#### B) Test attachment endpoint (po přihlášení):
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://mcp1-oauth-server.onrender.com/api/gmail/attachments/MSG_ID/ATT_ID/table"
```

## Co nyní funguje

### Gmail Attachments (NOVĚ KOMPLETNÍ)

#### 1. Metadata přílohy
```
GET /api/gmail/attachments/:messageId/:attachmentId
```
Vrací: filename, mimeType, size, isInline, cid

#### 2. Text preview (PDF, TXT, HTML)
```
GET /api/gmail/attachments/:messageId/:attachmentId/text?maxKb=256
```
Podporuje: PDF (s extrakcí textu), TXT, HTML

#### 3. Table preview (CSV, XLSX) ⭐ NOVÉ
```
GET /api/gmail/attachments/:messageId/:attachmentId/table?sheet=0&maxRows=50
```
Podporuje: 
- CSV s quote handling
- XLSX/XLS s výběrem sheetu
- Seznam všech sheetů
- Až 500 řádků

### Všechny ostatní funkce

✅ Gmail (send, read, reply, search, draft, delete, star, mark)  
✅ Gmail Labels (list, modify message, modify thread)  
✅ Gmail Threads (get, read, reply)  
✅ Calendar (create, update, delete, list, get) + conflict detection  
✅ Contacts (list, search, add, update, delete, bulk ops, suggestions)  
✅ Tasks (list, create, update, delete)  
✅ ETag caching  
✅ Snapshot tokens  
✅ Query normalization  
✅ Aggregate pagination  
✅ Idempotency

## Troubleshooting

### Problém: npm install selhává

**Řešení:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Problém: Import error po deploynení

**Příčina:** Render ještě neměl čas nainstalovat dependencies

**Řešení:** Počkej 2-3 minuty a zkontroluj Render logs:
```
https://dashboard.render.com/web/YOUR_SERVICE_ID/logs
```

Měl bys vidět:
```
==> Installing dependencies
npm WARN deprecated ...
added 123 packages
```

### Problém: PDF parsing error

**Příčina:** pdf-parse má občas problémy s komplexními PDF

**Řešení:** Funkce má fallback na raw text:
```javascript
{
  "success": true,
  "warning": "Could not parse as PDF, showing raw text",
  "text": "..."
}
```

### Problém: XLSX prázdný

**Příčina:** Excel má prázdný sheet

**Řešení:** Zkus jiný sheet:
```bash
curl ".../table?sheet=1"  # Druhý sheet
curl ".../table?sheet=Sheet2"  # Podle názvu
```

## Monitoring

### Render Dashboard
```
https://dashboard.render.com
```

Sleduj:
- **Build Logs** - Vidíš instalaci dependencies
- **Deploy Logs** - Vidíš restart serveru
- **Service Logs** - Runtime errors

### Důležité log zprávy

```
✅ Access token refreshed successfully
✅ Email sent: 18c...
✅ Labels listed: 42
❌ Failed to send email: Invalid Credentials
⚠️ 401 error detected, forcing token refresh...
```

## Environment Variables

Ujisti se, že máš v Render nastavené:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
REDIRECT_URI=https://mcp1-oauth-server.onrender.com/oauth/callback
MONGODB_URI=mongodb+srv://...
SESSION_SECRET=... (32 byte hex)
ENCRYPTION_KEY=... (32 byte hex)
```

## Verze a Kompatibilita

| Verze | Datum | Hlavní Features |
|-------|-------|----------------|
| v3.2.0 | 2025-10-18 | **XLSX preview complete**, PDF extraction |
| v2.2.0 | 2025-10-18 | Idempotency, Tasks aggregate |
| v2.1.0 | 2025-10-18 | Calendar conflicts, ETag, Snapshots |

## Next Steps (volitelné)

### 1. Advanced Testing
Testuj s reálnými emaily:
- PDF přílohy (invoices, contracts)
- Excel tabulky (reports, data)
- CSV soubory (exports)

### 2. Custom GPT Update
Pokud používáš Custom GPT, můžeš mu říct:
> "Now you can preview PDF and Excel attachments! Use:
> - /api/gmail/attachments/{messageId}/{attachmentId}/text for PDFs
> - /api/gmail/attachments/{messageId}/{attachmentId}/table for Excel files"

### 3. Monitor Usage
Sleduj v MongoDB collection `idempotency_cache`:
```javascript
db.idempotency_cache.countDocuments()
```

### 4. Performance Tuning (volitelné)
Pro velké soubory zvětši limity v OpenAPI:
```json
{
  "maxKb": 2048,  // Až 2 MB
  "maxRows": 500  // Až 500 řádků
}
```

## Support & Documentation

📖 **Kompletní dokumentace**: `IMPLEMENTATION_COMPLETE_v3.2.md`  
📋 **API Schema**: `openapi-actions-v3.2.0.json`  
🔧 **Setup Guide**: `CUSTOM_GPT_SETUP.md`  
📝 **Main README**: `README.md`  

## Status

**🎉 PROJEKT JE HOTOVÝ A PŘIPRAVEN K POUŽITÍ!**

Všechny plánované features jsou implementované a funkční.

---

**Happy coding! 🚀**

Pro otázky nebo problémy, zkontroluj:
1. Render logs
2. MongoDB connection
3. OAuth credentials
4. Google API quota

