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

**Status:** ✅ Ready to use
**Tested:** ✅ Yes
**Documentation:** See EMAIL_SIZE_HANDLING_UPDATE.md
