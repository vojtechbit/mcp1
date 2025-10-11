# Gmail & Calendar OAuth Server pro Custom GPT

🚀 OAuth proxy server pro ChatGPT Custom GPT - umožňuje asistentovi přistupovat k Gmail a Google Calendar.

## Co to umí

### Gmail:
- Posílat, číst, hledat emaily
- Odpovídat, vytvářet drafty
- Mazat, označovat hvězdičkou, mark as read

### Calendar:
- Vytvářet, upravovat, mazat události
- Listovat události, hledat v kalendáři
- Pozvat účastníky na schůzky

## Quick Start

### 1. Nainstaluj
```bash
npm install
```

### 2. Nastav .env
```bash
cp .env.example .env
# Vyplň Google OAuth credentials + MongoDB URI
# Vygeneruj secrets:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Deploy na Render
```bash
git push origin main
# Přidej environment variables na Render.com
```

### 4. Nastav Custom GPT
- **Instructions:** Zkopíruj z `GPT_CONFIG.md`
- **OAuth:** Viz `CUSTOM_GPT_SETUP.md`
- **Privacy:** `https://mcp1-oauth-server.onrender.com/privacy-policy`

## Testování

```bash
node test-oauth-proxy.js
```

## Bezpečnost

✅ AES-256-GCM encryption  
✅ OAuth 2.0  
✅ Rate limiting (100 req/15min)  
✅ TLS 1.3  
✅ Audit logs (90 dní)  

## Soubory

- `GPT_CONFIG.md` - Instructions pro Custom GPT
- `CUSTOM_GPT_SETUP.md` - Setup guide
- `test-oauth-proxy.js` - Testing

## Privacy

Privacy policy: https://mcp1-oauth-server.onrender.com/privacy-policy

---

**Built with ❤️ for seamless Gmail & Calendar through ChatGPT**
