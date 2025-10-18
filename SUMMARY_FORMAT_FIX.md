# Summary Format Fix - October 18, 2025

## 🐛 Problém

`include=summary` a `batchPreview(kind:"summary")` vrací jen **id + internalDate** místo kompletního formátu:
- from
- subject  
- date (ISO string)
- snippet

## 🔍 Příčina

**1. V `googleApiService.js` (řádek 395-398):**
```javascript
if (format === 'metadata') {
  return metadataResult.data;  // ← Vrací RAW Gmail API data!
}
```

Problém: Vrací raw data z Gmail API bez transformace. Raw data obsahují `payload.headers` array, ale ne transformované `from`, `subject`, `date`, `snippet` fieldy.

**2. V `gmailController.js` (řádek 273-281):**
```javascript
if (kind === 'summary') {
  const msg = await gmailService.readEmail(googleSub, id, { format: 'metadata' });
  return {
    id,
    from: msg.from,      // ← undefined!
    subject: msg.subject, // ← undefined!
    internalDate: msg.internalDate
  };
}
```

Problém: Očekává transformované `msg.from`, `msg.subject` ale ty neexistují. Chybí také `date` (ISO) a `snippet`.

## ✅ Řešení

### 1. Transformace v `googleApiService.js`

Přidána transformace metadata formátu na řádku 395-421:

```javascript
if (format === 'metadata') {
  console.log('✅ Email metadata retrieved:', messageId, `(${sizeEstimate} bytes)`);
  
  // Extract and transform headers for easy access
  const headers = metadataResult.data.payload.headers;
  const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
  const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
  
  // Parse displayName and email from "Name <email>" format
  let from = fromHeader;
  let fromEmail = fromHeader;
  let fromName = '';
  
  const emailMatch = fromHeader.match(/<(.+)>/);
  if (emailMatch) {
    fromEmail = emailMatch[1];
    fromName = fromHeader.replace(/<.+>/, '').trim().replace(/^["']|["']$/g, '');
  }
  
  return {
    ...metadataResult.data,
    // Transformed fields for easy access
    from: from,           // Full "Name <email>" format
    fromEmail: fromEmail, // Just email
    fromName: fromName,   // Just name
    subject: subjectHeader,
    date: new Date(parseInt(metadataResult.data.internalDate)).toISOString(), // ISO 8601
    snippet: snippet      // Gmail snippet
  };
}
```

**Co to dělá:**
- ✅ Extrahuje `From`, `Subject` headers z raw `payload.headers` array
- ✅ Parsuje "Name <email>" formát na `fromName` a `fromEmail`
- ✅ Konvertuje `internalDate` (ms timestamp) → ISO 8601 string
- ✅ Přidává `snippet` (Gmail preview text)
- ✅ Zachovává všechna původní data (`...metadataResult.data`)

### 2. Oprava v `gmailController.js`

Upravena funkce `fetchBatchPreview` na řádku 273-281:

```javascript
if (kind === 'summary') {
  const msg = await gmailService.readEmail(googleSub, id, { format: 'metadata' });
  return {
    id,
    from: msg.from,      // ✅ Nyní existuje
    subject: msg.subject, // ✅ Nyní existuje  
    date: msg.date,      // ✅ ISO string (ne internalDate)
    snippet: msg.snippet // ✅ Email preview
  };
}
```

**Co to dělá:**
- ✅ Vrací `date` (ISO string) místo `internalDate` (timestamp)
- ✅ Přidává `snippet` field
- ✅ Používá transformované fieldy z `readEmail`

## 📋 Výsledný Formát

### Před opravou:
```json
{
  "id": "1234567890",
  "internalDate": "1729252800000"
}
```

### Po opravě:
```json
{
  "id": "1234567890",
  "from": "John Doe <john@example.com>",
  "subject": "Meeting tomorrow at 2pm",
  "date": "2024-10-18T10:30:00.000Z",
  "snippet": "Hi, just confirming our meeting tomorrow at 2pm. Looking forward..."
}
```

## 🧪 Testování

Spusť test:
```bash
node test-summary-fix.js
```

Test ověří:
1. ✅ `readEmail(format="metadata")` vrací transformované fieldy
2. ✅ Simulace `batchPreview(kind="summary")` vrací správný formát
3. ✅ Všechny required fieldy existují: id, from, subject, date, snippet

## 🎯 Co je nyní opraveno

✅ **include=summary v searchEmails** - vrací správný formát
✅ **batchPreview(kind:"summary")** - vrací správný formát  
✅ **readEmail(format="metadata")** - vrací transformované fieldy
✅ **Parsování From header** - "Name <email>" → fromName + fromEmail
✅ **Date jako ISO 8601** - ne ms timestamp
✅ **Snippet included** - Gmail preview text

## 📝 Změněné Soubory

1. **src/services/googleApiService.js**
   - Přidána transformace pro format='metadata'
   - Extrakce a parsování headers
   - Konverze internalDate → ISO date

2. **src/controllers/gmailController.js**
   - Oprava fetchBatchPreview
   - Změna internalDate → date
   - Přidání snippet fieldu

3. **test-summary-fix.js** (nový)
   - Test pro ověření opravy

## 🚀 Deploy

Po ověření testu:
```bash
git add .
git commit -m "fix: include=summary and batchPreview now return full format"
git push
```

---

**Status:** ✅ FIXED  
**Date:** October 18, 2025  
**Files Changed:** 2  
**Tests Added:** 1
