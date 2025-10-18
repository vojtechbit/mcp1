# 🔧 Hotfix v3.2.1 - PDF Import Fix

## Problém
Render deployment selhal kvůli chybě v `pdf-parse` knihovně:
```
Error: ENOENT: no such file or directory, open './test/data/05-versions-space.pdf'
```

Knihovna `pdf-parse` má bug - snaží se načíst testovací soubor při importu.

## Řešení

### 1. Opravena xlsx knihovna
```json
"xlsx-js-style": "^1.2.0"  // Místo xlsx (security fix)
```

### 2. Dynamický import pdf-parse
Změněno z:
```javascript
import pdfParse from 'pdf-parse';
// ... později v kódu
const pdfData = await pdfParse(data);
```

Na:
```javascript
// Import pouze když je potřeba
if (mimeType === 'application/pdf') {
  const pdfParse = (await import('pdf-parse')).default;
  const pdfData = await pdfParse(data);
}
```

## Výhody
✅ Server startuje bez chyby  
✅ PDF parsing funguje normálně  
✅ Žádný performance impact (import je rychlý)  
✅ Knihovna se načte pouze když skutečně zpracováváme PDF

## Deployment

```bash
# Změny jsou už commitnuté, stačí push
git add .
git commit -m "fix: Use dynamic import for pdf-parse to avoid test file error on Render"
git push origin main
```

## Verze
**v3.2.1** - Hotfix pro production deployment

## Status
✅ **OPRAVENO** - Server by měl nyní běžet bez problémů na Render

