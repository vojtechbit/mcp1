# Audit limitů - Shrnutí oprav

**Datum:** 2025-10-19  
**Auditovaný soubor:** `openapi-facade-final copy.json`

## 📊 Výsledky auditu

### ✅ Správně implementované limity

1. **`/macros/inbox/overview`**
   - Schema: `maxItems` default 100, max 200
   - Backend: `PAGE_SIZE_DEFAULT=100`, `PAGE_SIZE_MAX=200`
   - ✅ **SEDÍ**

2. **`/macros/email/quickRead`**
   - Schema: max 50 IDs
   - Backend: `BATCH_READ_MAX_IDS=50`
   - ✅ **SEDÍ**

3. **`/macros/calendar/schedule` - reminders**
   - Schema: max 5 reminders (1-1440 minutes)
   - Backend: Validuje `reminders.length > 5` a rozsah 1-1440
   - ✅ **SEDÍ**

### ❌ Nalezené problémy a jejich opravy

#### Problém 1: `/macros/inbox/snippets` - chybějící limit
**Popis:**
- Schema definuje: `maxItems` default 50, **MAX 50**
- Backend mohl přijmout až 200 (protože volal `inboxOverview` bez omezení)

**Oprava v `src/services/facadeService.js`:**
```javascript
export async function inboxSnippets(googleSub, params) {
  const { includeAttachments = true, maxItems = 50 } = params;
  
  // Enforce max 50 items for snippets (as per OpenAPI schema)
  if (maxItems > 50) {
    const error = new Error('maxItems cannot exceed 50 for inbox snippets');
    error.statusCode = 400;
    throw error;
  }
  
  const overview = await inboxOverview(googleSub, { ...params, maxItems: Math.min(maxItems, 50) });
  // ...
}
```

#### Problém 2: `/macros/calendar/schedule` - chybějící validace attendees
**Popis:**
- Schema definuje: max 20 attendees
- Backend neměl žádnou validaci pro počet attendees

**Oprava v `src/services/facadeService.js`:**
```javascript
export async function calendarSchedule(googleSub, params) {
  const { title, when, attendees = [], /* ... */ } = params;

  // Validate attendees parameter
  if (attendees && attendees.length > 20) {
    const error = new Error('Too many attendees. Maximum 20 allowed.');
    error.statusCode = 400;
    throw error;
  }
  // ...
}
```

#### Problém 3: `/macros/contacts/safeAdd` - chybějící validace maxima
**Popis:**
- Schema definuje: `minItems: 1`, `maxItems: 50`
- Backend validoval pouze minimum, ale ne maximum

**Oprava v `src/services/facadeService.js`:**
```javascript
export async function contactsSafeAdd(googleSub, params) {
  const { entries, dedupeStrategy = 'ask' } = params;

  if (!entries || entries.length === 0) {
    throw { statusCode: 400, message: 'No entries provided' };
  }

  // Validate maximum entries (as per OpenAPI schema)
  if (entries.length > 50) {
    const error = new Error('Too many entries. Maximum 50 allowed.');
    error.statusCode = 400;
    throw error;
  }
  // ...
}
```

## 📋 Kompletní tabulka limitů

| Endpoint | Parametr | Schema Limit | Backend Stav | Status |
|----------|----------|--------------|--------------|--------|
| `/macros/inbox/overview` | maxItems | default:100, max:200 | ✅ Správně | ✅ |
| `/macros/inbox/snippets` | maxItems | default:50, max:50 | ✅ Opraveno | ✅ |
| `/macros/email/quickRead` | ids | max:50 | ✅ Správně | ✅ |
| `/macros/calendar/plan` | events | max:50 | ✅ Správně | ✅ |
| `/macros/calendar/schedule` | attendees | max:20 | ✅ Opraveno | ✅ |
| `/macros/calendar/schedule` | reminders | max:5 | ✅ Správně | ✅ |
| `/macros/contacts/safeAdd` | entries | min:1, max:50 | ✅ Opraveno | ✅ |
| `/macros/tasks/overview` | - | - | ✅ Správně | ✅ |

## ✨ Závěr

Všechny nalezené nesrovnalosti mezi OpenAPI schématem a backendem byly úspěšně opraveny. Backend nyní plně respektuje všechny limity definované v OpenAPI schématu `openapi-facade-final copy.json`.

### Soubory změněny:
- `src/services/facadeService.js` (3 změny)

### Doporučení:
1. ✅ Commit změn do Git
2. ✅ Aktualizovat dokumentaci
3. ✅ Otestovat všechny endpointy s limity
4. ✅ Nasadit na produkční server
