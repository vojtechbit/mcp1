# 📧 Email Size Handling Update

## 🎯 Problém
GPT Custom Actions nemohl zpracovat velké emaily (HTML newslettery, marketingové emaily s obrázky) protože:
- Gmail API vracel příliš velké response (několik MB)
- GPT má limit na velikost API response
- Způsobovalo to selhání při čtení emailů

## ✅ Řešení - 3 vrstvy ochrany

### 1️⃣ Inteligentní automatické zkracování
**Konstanta:** `EMAIL_SIZE_LIMITS` v `googleApiService.js`

```javascript
const EMAIL_SIZE_LIMITS = {
  MAX_SIZE_BYTES: 100000,       // 100KB - nad tímto se email automaticky zkrátí
  MAX_BODY_LENGTH: 8000,        // Maximální délka plain text těla
  MAX_HTML_LENGTH: 5000,        // Maximální délka HTML těla  
  WARNING_SIZE_BYTES: 50000     // 50KB - nad tímto se zobrazí varování
};
```

### 2️⃣ Nový endpoint pro rychlý náhled
**GET** `/api/gmail/snippet/:messageId`

- Vždy vrací malou response
- Ideální pro kontrolu obsahu před načtením celého emailu
- Obsahuje snippet, headers, velikost emailu

### 3️⃣ Parametr format pro existující endpoint
**GET** `/api/gmail/read/:messageId?format=full&autoTruncate=true`

**Parametry:**
- `format`: `full` (default), `metadata`, `snippet`, `minimal`
- `autoTruncate`: `true` (default), `false`

## 📋 Co se změnilo

### Soubory:
1. ✅ `src/services/googleApiService.js`
   - Přidány konstanty `EMAIL_SIZE_LIMITS`
   - Nové helper funkce: `extractPlainText()`, `truncateText()`, `stripHtmlTags()`
   - Upravena `readEmail()` funkce s inteligentním zkracováním

2. ✅ `src/controllers/gmailController.js`
   - Upraveno `readEmail()` - podpora query parametrů
   - Přidáno `getEmailSnippet()` - nový controller pro snippet

3. ✅ `src/routes/apiRoutes.js`
   - Přidána route pro snippet endpoint

4. ✅ `openapi-schema.json`
   - Aktualizován endpoint `/api/gmail/read/{messageId}`
   - Přidán nový endpoint `/api/gmail/snippet/{messageId}`
   - Přidány nové schemas

## 🚀 Jak to funguje

### Automatické zkracování velkých emailů:

1. **Email < 50KB** → Vrátí se normálně
2. **Email 50KB - 100KB** → Vrátí se s varováním
3. **Email > 100KB** → Automaticky zkrácen:
   ```json
   {
     "truncated": true,
     "bodyPreview": "Text zkrácen na 8000 znaků...",
     "truncationInfo": {
       "originalSize": 250000,
       "maxAllowedSize": 100000,
       "truncatedBodyLength": 8000
     }
   }
   ```

### Použití různých formátů:

```bash
# Plný email (s auto-zkracováním)
GET /api/gmail/read/abc123?format=full

# Jen metadata
GET /api/gmail/read/abc123?format=metadata

# Jen snippet
GET /api/gmail/read/abc123?format=snippet

# Plný email BEZ zkracování (může být příliš velký!)
GET /api/gmail/read/abc123?format=full&autoTruncate=false

# Rychlý náhled (doporučeno pro velké emaily)
GET /api/gmail/snippet/abc123
```

## 🎓 Pro GPT Custom Actions

GPT teď má 3 možnosti jak číst emaily:

1. **Normální čtení** - `readEmail` (s auto-ochranou)
2. **Rychlý náhled** - `getEmailSnippet` (vždy malý)
3. **Jen metadata** - `readEmail?format=metadata` (hlavičky)

### Doporučený flow:
```
1. Uživatel: "Přečti email XYZ"
2. GPT zavolá: getEmailSnippet → zkontroluje velikost
3. Pokud je velký: GPT informuje uživatele
4. GPT zavolá: readEmail → dostane zkrácenou verzi
```

## 📊 Response příklady

### Normální email (úspěch):
```json
{
  "success": true,
  "message": { /* full email data */ },
  "format": "full",
  "truncated": false
}
```

### Velký email (automaticky zkrácen):
```json
{
  "success": true,
  "message": {
    "snippet": "Email preview...",
    "bodyPreview": "Text zkrácen...",
    "truncated": true,
    "truncationInfo": {
      "originalSize": 250000,
      "maxAllowedSize": 100000
    }
  },
  "truncated": true,
  "note": "Email byl zkrácen kvůli velikosti..."
}
```

### Snippet response:
```json
{
  "success": true,
  "snippet": "Short preview of email...",
  "messageId": "abc123",
  "sizeEstimate": 250000,
  "headers": [...]
}
```

## ⚙️ Úprava limitů

Pro změnu limitů upravte konstanty v `src/services/googleApiService.js`:

```javascript
const EMAIL_SIZE_LIMITS = {
  MAX_SIZE_BYTES: 100000,      // Zvýšit/snížit podle potřeby
  MAX_BODY_LENGTH: 8000,       // Více/méně textu
  MAX_HTML_LENGTH: 5000,       
  WARNING_SIZE_BYTES: 50000    
};
```

## 🔄 Zpětná kompatibilita

✅ Všechny stávající volání fungují beze změn
✅ Automatické zkracování je default
✅ Žádné breaking changes

## 🎉 Výsledek

- ✅ GPT už nikdy nedostane příliš velkou response
- ✅ Velké emaily se automaticky zkrátí
- ✅ GPT ví když byl email zkrácen
- ✅ Rychlý snippet endpoint pro preview
- ✅ Flexibilní format parametr pro různé use cases

---

**Vytvořeno:** ${new Date().toISOString()}
**Autor:** Claude + Vojtech
**Status:** ✅ Hotovo a otestováno
