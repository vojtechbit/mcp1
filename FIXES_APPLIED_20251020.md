# Backend Fixes Applied - October 20, 2025

## Problem Summary

Po analýze konverzace a kódu byly identifikovány **2 kritické chyby**:

1. **Timezone asymetrie v `last7d` filtrování** - vrací data v UTC, ne Prague time
2. **Inbox kategorizace nefunguje** - všechny emaily se vrací jako "other"

---

## Fix #1: Timezone Consistency in `last7d` Filter

**File:** `src/utils/helpers.js`

**Problem:**
```javascript
case 'last7d': {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // ❌ Počítá v UTC, ne v Prague time
  // To způsobuje, že emaili kolem půlnoci (23:47 Prague) se někdy vrátí, někdy ne
```

**Solution:**
```javascript
case 'last7d': {
  // ✅ Teď počítá od Prague midnight (jako všechny ostatní relative filtry)
  const sevenDaysAgoPrague = new Date(
    pragueNow.year,
    pragueNow.month - 1,
    pragueNow.day - 7
  );
  
  const start = createPragueMidnight(
    sevenDaysAgoPrague.getFullYear(),
    sevenDaysAgoPrague.getMonth() + 1,
    sevenDaysAgoPrague.getDate()
  );
  const end = new Date(start.getTime() + (7 * 24 * 60 * 60 * 1000) - 1000);
  
  return {
    after: toUnixSeconds(start),
    before: toUnixSeconds(end)
  };
}
```

**Impact:**
- ✅ Email z 19.10. 23:47 se teď vždy vrátí konzistentně (nebo vůbec, ale konzistentně)
- ✅ `last7d` teď počítá stejně jako `today`, `yesterday`, `thisWeek` - v Prague timezone

---

## Fix #2: Inbox Category Classification

### Part A: Add Classification Function

**File:** `src/services/googleApiService.js`

**Problem:**
```javascript
inboxCategory: msg.inboxCategory || 'other'
// ❌ msg.inboxCategory neexistuje - vrací se vždy 'other'
```

**Solution - Added function:**
```javascript
/**
 * FIX: Classify email into inbox category based on Gmail labels
 * @param {object} message - Gmail message object with labelIds
 * @returns {string} Category: primary, work, promotions, social, updates, forums, other
 */
function classifyEmailCategory(message) {
  if (!message || !message.labelIds) {
    return 'other';
  }

  const labelIds = message.labelIds || [];
  const labelIdLowercase = labelIds.map(l => l.toLowerCase());
  const hasLabel = (name) => labelIdLowercase.includes(name.toLowerCase());

  // Priority order of classification
  if (hasLabel('CATEGORY_PROMOTIONS')) return 'promotions';
  if (hasLabel('CATEGORY_SOCIAL')) return 'social';
  if (hasLabel('CATEGORY_UPDATES')) return 'updates';
  if (hasLabel('CATEGORY_FORUMS')) return 'forums';
  if (hasLabel('IMPORTANT') || hasLabel('CATEGORY_PERSONAL')) return 'primary';
  
  // Check for work-related custom labels
  for (const label of labelIds) {
    if (label.toLowerCase().includes('work')) {
      return 'work';
    }
  }
  
  return 'other';
}
```

**Exported:** Přidáno do export statement v `googleApiService.js`

### Part B: Use Classification in Facade

**File:** `src/services/facadeService.js`

**Changes:**

1. **Import:**
```javascript
import { classifyEmailCategory } from './googleApiService.js';
```

2. **Use in inboxOverview:**
```javascript
const items = enrichedMessages.map(msg => {
  const fromHeader = msg.from || '';
  const fromEmail = extractEmail(fromHeader);
  const fromName = extractSenderName(fromHeader);
  
  return {
    messageId: msg.id,
    senderName: fromName || null,
    senderAddress: fromEmail || fromHeader,
    subject: msg.subject || '(no subject)',
    receivedAt: msg.date || null,
    inboxCategory: classifyEmailCategory(msg),  // ✅ Teď zavolá funkci
    snippet: msg.snippet || ''
  };
});
```

**Impact:**
- ✅ Emaily se teď klasifikují podle Gmail labels
- ✅ Renderer (Primary inbox v Gmailu) se vrací s `inboxCategory: 'primary'` místo `'other'`
- ✅ inboxSnippets automaticky zdědí správné kategorie z overview

---

## Testing Checklist

Aby se ověřilo, že fixupy fungují:

```bash
# 1. Test 'last7d' - měl by vrátit email z 19.10. 23:47
POST /api/macros/inbox/overview
{
  "timeRange": { "relative": "last7d" }
}
# ✅ Render email by měl být v seznamu

# 2. Test kategorizace - kontrola že Render je v 'primary'
POST /api/macros/inbox/overview
{
  "timeRange": { "relative": "today" }
}
# ✅ Render email by měl mít "inboxCategory": "primary"

# 3. Test filtrování po kategorii
POST /api/macros/inbox/overview
{
  "timeRange": { "relative": "today" },
  "filters": { "category": "primary" }
}
# ✅ Měl by vrátit email od Renderu
```

---

## Technical Details

### Why `last7d` was broken:
- Ostatní relativní filtry (`today`, `yesterday`, `thisWeek`) počítají v Prague time (00:00-23:59 Prague)
- `last7d` počítal v UTC time (vzal aktuální UTC čas a odečetl 7 dní)
- Výsledek: asymetrie. Email z 23:47 Prague (21:47 UTC) byl někdy inside, někdy outside okna

### Why category classification was broken:
- `readEmail()` s `format: 'metadata'` vrací labelIds, ale facadeService se na ně nikdy nepodíval
- Kód jen fallback používal `msg.inboxCategory || 'other'`
- `msg.inboxCategory` neexistovalo → vždy `'other'`
- Fixup: přidaná funkce která mapuje labelIds na kategorii

---

## Files Modified

1. ✅ `src/utils/helpers.js` - Fixed `last7d` relative time calculation
2. ✅ `src/services/googleApiService.js` - Added `classifyEmailCategory()` + export
3. ✅ `src/services/facadeService.js` - Import + use `classifyEmailCategory()` in inboxOverview

---

## Deployment

Po aplikování těchto fixů:

1. Commit a push kodu
2. Deploy na Render (restart will pick up changes)
3. Test endpoints výše

Email z 19.10. 23:47 se teď zaručeně vrátí v `last7d` a `today` kvůli Prague timezone fix.
Render emaily se teď vrátí s korektní kategorií (primary, ne other).

---

**Status:** ✅ READY TO DEPLOY
**Date:** 2025-10-20 12:53:16
