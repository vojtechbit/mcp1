# Gmail & Calendar OAuth Server pro Custom GPT

🚀 OAuth proxy server pro ChatGPT Custom GPT - umožňuje asistentovi přistupovat k Gmail a Google Calendar.

## Co to umí

### Gmail:
- Posílat, číst, hledat emaily
- Odpovídat, vytvářet drafty
- Mazat, označovat hvězdičkou, mark as read
- Batch operace (preview, read)
- Aggregate mode pro velké dotazy
- Mail summaries
- Normalizace dotazů a relativní čas

### Calendar:
- Vytvářet, upravovat, mazat události
- Listovat události, hledat v kalendáři
- Pozvat účastníky na schůzky
- Detekce konfliktů (checkConflicts)
- Aggregate mode pro velké rozsahy

### Contacts:
- Hledat a spravovat kontakty
- Bulk operace (upsert, delete)
- Fuzzy adresní návrhy
- Google Sheets integrace

## Quick Start

### 1. Nainstaluj
```bash
npm install
```

### 2. Nastav .env
```bash
cp .env.example .env
# Vyplň Google OAuth credentials + MongoDB URI
# Vygeneruj secrets (opakuj dvakrát - jeden pro ENCRYPTION_KEY, druhý pro PROXY_TOKEN_SECRET):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Deploy na Render
```bash
git push origin main
# Přidej environment variables na Render.com (viz tabulka níže)
```

> ✅ **Důležité:** Na Renderu nastav `PROXY_TOKEN_SECRET` na _jiný_ 32-bytový hex string, než používáš pro `ENCRYPTION_KEY`.
> Pokud jej nenastavíš, server použije `ENCRYPTION_KEY`, ale kvůli bezpečnosti se doporučuje mít
> dedikované tajemství jen pro proxy tokeny.

> ℹ️ **`ADVANCED_DEBUG` flag:** Tento volitelný env var můžeš přidat na Render, pokud chceš
> mít podrobný tracing a logování. Stačí použít hodnotu `true`, `1`, `yes` nebo `on` pro
> zapnutí. Pokud proměnnou nenastavíš, produkční běh zůstane v "quiet" režimu, ale testy
> ji automaticky zapínají. Nastavení na `false`, `0`, `no`, `off` nebo `quiet` ji naopak
> vypne i při běhu testů, kdyby bylo potřeba otestovat tichý režim.

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
✅ Rate limiting (600 req/15min + dedicated OAuth limiter)
✅ Proxy tokens uložené jako HMAC hash (bez plaintextu v DB)
✅ TLS 1.3
✅ Audit logs (90 dní)
✅ Sanitizované logování OAuth flow (opt-in)

### Důležité env proměnné

| Klíč | Popis |
| --- | --- |
| `ENCRYPTION_KEY` | 64 hex znaků pro AES-256-GCM šifrování Google tokenů. |
| `PROXY_TOKEN_SECRET` | HMAC tajemství pro hashování proxy tokenů (lze rotovat přes `PROXY_TOKEN_ADDITIONAL_SECRETS`). |
| `ENABLE_BACKGROUND_REFRESH` | `true` pro periodický refresh (výchozí). Nastav `false` pokud ho chceš vypnout. |
| `TOKEN_REFRESH_CONCURRENCY` | (volitelné) Maximální paralelní refresh joby, default 3. |
| `STARTUP_REFRESH_THRESHOLD_MS` | (volitelné) Jak daleko před expirací se během startu refreshe spustí (default 1h). |
| `BACKGROUND_REFRESH_THRESHOLD_MS` | (volitelné) Buffer pro background refresh (default 2h). |
| `OAUTH_REQUEST_LOGGING` | Zapni jen při ladění (`true`); výstup je redigovaný. |

## Soubory

- `GPT_CONFIG.md` - Instructions pro Custom GPT
- `CUSTOM_GPT_SETUP.md` - Setup guide
- `test-oauth-proxy.js` - Testing

## Privacy

Privacy policy: https://mcp1-oauth-server.onrender.com/privacy-policy

---

**Built with ❤️ for seamless Gmail & Calendar through ChatGPT**
