# Analýza produkčních rizik: OAuth Proxy Server pro Gmail & Calendar

**Datum analýzy:** 2025-11-04
**Typ aplikace:** Node.js/Express OAuth Proxy Server pro Custom GPT
**Hlavní funkce:** Bridge mezi ChatGPT a Google APIs (Gmail, Calendar, Contacts, Tasks)

---

## 📋 EXECUTIVE SUMMARY

Vaše aplikace je **OAuth proxy server s BFF (Backend For Frontend) architekturou**, který zajišťuje bezpečný přístup Custom GPT asistenta k Google službám. Aplikace implementuje solidní bezpečnostní základy (AES-256-GCM encryption, rate limiting, token refresh), ale má několik **kritických rizik** v produkci.

### ⚠️ TOP 5 KRITICKÝCH RIZIK

| # | Riziko | Severity | Impact v produkci |
|---|--------|----------|-------------------|
| 1 | **Žádná rotace encryption klíče** | 🔴 HIGH | Pokud `ENCRYPTION_KEY` unikne, všechny uživatelské tokeny jsou kompromitovány. Změna klíče zničí všechna existující data. |
| 2 | **Heuristika pro token expiry** | 🟠 MEDIUM | Kód spoléhá na `expiry_date > 86400` k rozlišení ms/seconds. Může selhat při změnách Google API. |
| 3 | **Refresh token limit (50/user)** | 🟠 MEDIUM | Google automaticky invaliduje nejstarší refresh token po 50. vydaných. Může dojít k náhlému odhlášení uživatelů. |
| 4 | **Single point of failure - MongoDB** | 🟠 MEDIUM | Jediné připojení k DB. Pokud zemře, app musí rebuildit (~30s downtime). |
| 5 | **Chybějící audit logging** | 🟡 LOW | Není záznam kdo, co a kdy dělal. Compliance riziko, žádná forensika při incidentu. |

---

## 🏗️ ARCHITEKTURA APLIKACE

```
ChatGPT Custom GPT
      ↓
  OAuth Proxy Layer (proxy tokeny, HMAC-SHA512)
      ↓
  Express Middleware (auth, rate limiting, error handling)
      ↓
  BFF Facade Layer (makra optimalizovaná pro konverzaci)
      ↓
  Service Layer (Gmail, Calendar, Contacts, Tasks)
      ↓
  Google APIs (REST API)
      ↓
  MongoDB (encrypted tokens, AES-256-GCM)
```

---

## 🔥 KRITICKÁ RIZIKA V PRODUKCI

### 1️⃣ Token Management & OAuth Flow

#### **A) Refresh Token Revocation (invalid_grant)**
**Co se stane:**
- Uživatel změní heslo → Google invaliduje všechny refresh tokeny
- Aplikace dostane `invalid_grant` error při refresh pokusu
- Background refresh označí `refresh_token_revoked = true` v DB
- Uživatel je **trvale odhlášen** bez notifikace

**Kde v kódu:**
- `src/services/backgroundRefreshService.js:108` - detekce `invalid_grant`
- `src/services/backgroundRefreshService.js:116` - označení jako revoked

**Současné řešení:**
- ✅ Aplikace detekuje `invalid_grant` a přestane refreshovat
- ❌ **Chybí:** Notifikace Alfredovi, že uživatel potřebuje re-auth
- ❌ **Chybí:** Proaktivní upozornění v GPT konverzaci

**Doporučení:**
- [ ] Vytvořit endpoint `/api/auth/reauth-required` pro Alfred
- [ ] Přidat webhook notifikaci při revokaci
- [ ] Implementovat "soft re-auth" flow (zkusit OAuth refresh před hard reject)

---

#### **B) Expiry Date Heuristic Fragility**
**Problém:**
```javascript
// src/services/googleApiService.js:286
let expiryDate;
const expiryValue = newTokens.expiry_date || 3600;
if (expiryValue > 86400) {  // ⚠️ HEURISTIKA: pokud > 1 den v sekundách
  expiryDate = new Date(expiryValue * 1000);  // Assume milliseconds
} else {
  expiryDate = new Date(Date.now() + (expiryValue * 1000));  // Assume seconds
}
```

**Co může selhat:**
- Google API změní formát z `expiry_date` (ms timestamp) na `expires_in` (seconds)
- Heuristika failne pokud Google vrátí timestamp v jiné jednotce
- Token expiry se špatně spočítá → předčasné nebo pozdní refreshe

**Současný stav:**
- `backgroundRefreshService.js:16-26` má správnou logiku (používá `expiry_date` vs `expires_in`)
- `googleApiService.js:286` má heuristiku

**Doporučení:**
- [ ] Sjednotit na `determineExpiryDate()` funkci z `backgroundRefreshService.js`
- [ ] Logovat warning pokud `expiry_date` není číslo nebo je mimo rozsah
- [ ] Přidat unit test s edge cases (0, negative, very large numbers)

---

#### **C) Refresh Token Limit (50 per user per client)**
**Google limit:**
- Maximálně **50 refresh tokenů** na uživatele na OAuth client
- 51. token automaticky invaliduje nejstarší token

**Scénář selhání:**
1. Uživatel se přihlásí v produkci (token #1)
2. Vývojář testuje autentikaci 50x v dev environmentu (tokeny #2-51)
3. **Produkční token #1 je automaticky invalidován**
4. Uživatel v produkci dostane 401 Unauthorized bez vysvětlení

**Současné řešení:**
- ❌ Žádná detekce tohoto stavu
- ❌ Žádný tracking počtu aktivních tokenů

**Doporučení:**
- [ ] Dokumentovat v README.md (varování pro vývojáře)
- [ ] Používat **separátní OAuth clienty** pro dev/staging/prod
- [ ] Logovat při `invalid_grant` s hintem na token limit

---

### 2️⃣ Database & Connection Resilience

#### **A) Single MongoDB Connection**
**Problém:**
```javascript
// src/config/database.js
let db = null;
let client = null;

async function connectToDatabase() {
  if (db) {
    await db.admin().ping();  // Health check
    return db;
  }
  // ... vytvoření nového připojení s retry ...
}
```

**Co může selhat:**
- MongoDB server restartuje → připojení zemře
- Network blip → connection timeout
- Aplikace musí rebuildit connection (5 retries × exponential backoff = ~30s)
- **Všechny requesty během rebuildu failují**

**Současné řešení:**
- ✅ Exponential backoff retry (1s, 2s, 4s, 8s, 10s)
- ✅ Health check ping před použitím
- ❌ **Chybí:** Connection pooling
- ❌ **Chybí:** Graceful degradation při DB outage

**Doporučení:**
- [ ] Přidat connection pool (min: 2, max: 10 connections)
- [ ] Implementovat circuit breaker pattern
- [ ] Cache kritická data (user tokens) in-memory s short TTL
- [ ] Metric tracking: DB connection failures, retry counts

---

#### **B) Encryption Key Rotation Absence**
**Kritické:**
```javascript
// src/services/tokenService.js:8
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;  // ⚠️ SINGLE KEY, NO ROTATION
```

**Co když klíč unikne:**
1. Útočník má přístup k DB dump
2. S `ENCRYPTION_KEY` může dešifrovat **všechny** access & refresh tokeny
3. Má plný přístup k emailům, kalendářům, kontaktům všech uživatelů

**Současné řešení:**
- ✅ AES-256-GCM (silný šifrovací algoritmus)
- ✅ Unique IV a auth tag pro každý token
- ❌ **Chybí:** Key versioning
- ❌ **Chybí:** Migrace při key rotation

**Doporučení:**
- [ ] Implementovat multi-key schema:
  ```javascript
  const ENCRYPTION_KEYS = {
    v1: process.env.ENCRYPTION_KEY,
    v2: process.env.ENCRYPTION_KEY_V2,  // Nový klíč
  };

  // Při ukládání: vždy použít nejnovější (v2)
  // Při čtení: zkusit všechny klíče (fallback pro migraci)
  ```
- [ ] Přidat `encryption_key_version` pole do DB
- [ ] Background job pro re-encryption starých tokenů

---

### 3️⃣ Google API Rate Limiting & Quotas

#### **A) Calendar API Usage Limits**
**Google limity:**
- **1,000,000 requests/day** (project-wide)
- **10 requests/second/user**
- **Burst limit:** 100 requests/10 seconds

**Scénář selhání:**
1. Alfred má 100 aktivních uživatelů
2. Každý dělá aggregate query pro "last month" → 100 events × 100 users = 10,000 req
3. **Rate limit exceeded → 429 Too Many Requests**
4. Alfred dostane error bez context proč

**Současné řešení:**
- ✅ Aggregate mode s page size limits (`AGGREGATE_CAP_CAL = 4000`)
- ✅ Rate limiting na serveru (150 heavy requests/15min)
- ❌ **Chybí:** Google quota monitoring
- ❌ **Chybí:** Exponential backoff při 429

**Doporučení:**
- [ ] Přidat retry logic s exponential backoff pro 429 errors
- [ ] Implementovat quota tracking (counter v DB nebo Redis)
- [ ] Error message pro Alfreda: "Překročen denní limit Google Calendar API. Zkuste zítra."

---

#### **B) Gmail API Attachment Size**
**Problem:**
- Některé emaily jsou 10MB+ (s přílohami)
- Fetch může trvat 5-10 sekund
- Timeout middlewaru (default 2 min) může vypršet

**Současné řešení:**
- ✅ Truncate body na 8KB (`EMAIL_SIZE_LIMITS.MAX_BODY_LENGTH`)
- ✅ Metadata-only fetch pro size check
- ❌ **Chybí:** Timeout pro velké emaily
- ❌ **Chybí:** Streaming download pro attachments

**Doporučení:**
- [ ] Přidat progress indicator pro Alfred ("Stahuji velký email...")
- [ ] Implementovat stream download s progress callback
- [ ] Cache velkých emailů na disk (temporary storage)

---

### 4️⃣ Security Vulnerabilities

#### **A) OAuth Redirect Validation**
**Riziko: Open Redirect Attack**

**Scénář:**
```
1. Útočník vytvoří malicious link:
   https://your-app.com/auth/google?redirect_uri=https://evil.com

2. Uživatel klikne → OAuth flow začne
3. Po úspěšné autentikaci → redirect na https://evil.com s auth code
4. Útočník zachytí auth code → ukradne uživatelský účet
```

**Současné řešení:**
- ✅ CORS whitelist (`chat.openai.com`, `chatgpt.com`)
- ❌ **Chybí:** Strict validation `redirect_uri` v OAuth flow
- ❌ **Chybí:** PKCE (Proof Key for Code Exchange)

**Doporučení:**
- [ ] Implementovat PKCE pro OAuth code exchange
- [ ] Whitelist allowed `redirect_uri` patterns
- [ ] Logovat všechny auth attempts s IP adresou

---

#### **B) Plaintext User Emails in Database**
**Riziko:**
```javascript
// src/services/databaseService.js:63
email: email,  // ⚠️ PLAINTEXT
```

**Impact:**
- DB dump leak → útočník má všechny emailové adresy uživatelů
- GDPR compliance risk (není end-to-end encryption)

**Doporučení:**
- [ ] Hashovat emaily s pepper (one-way hash pro lookup)
- [ ] Nebo: Encrypt emaily separátním klíčem od tokenů
- [ ] Přidat `email_encrypted` field s migration

---

### 5️⃣ Error Handling & Observability

#### **A) Chybějící Strukturované Logování**
**Problém:**
```javascript
console.error('❌ Failed to refresh token for', email);  // ⚠️ Nestrukturované
```

**Co chybí:**
- Request ID (tracing napříč services)
- User context (google_sub, email)
- Timestamp s ms precision
- Error stack traces

**Doporučení:**
- [ ] Implementovat structured logger (Winston nebo Pino)
  ```javascript
  logger.error('Token refresh failed', {
    requestId: req.id,
    googleSub: user.google_sub,
    email: user.email,
    errorCode: 'invalid_grant',
    retryCount: 2,
    timestamp: Date.now()
  });
  ```
- [ ] Přidat correlation ID do všech error responses
- [ ] Integrovat s monitoring (Sentry, Datadog)

---

#### **B) Alfred Error Messages**
**Současný stav:**
```json
{
  "error": "Bad Gateway",
  "message": "Failed to send email",
  "code": "EMAIL_SEND_FAILED"
}
```

**Co chybí:**
- Actionable hints (co má uživatel/Alfred udělat)
- Retry suggestions
- Link na docs nebo troubleshooting

**Příklad zlepšení:**
```json
{
  "error": "Email Send Failed",
  "message": "Gmail API rate limit exceeded. Please try again in 5 minutes.",
  "code": "EMAIL_SEND_FAILED",
  "actionable": {
    "suggestedAction": "retry_later",
    "retryAfter": 300,  // seconds
    "hint": "Překročen limit 100 emailů/hodinu. Počkejte chvíli a zkuste znovu."
  },
  "docs": "https://docs.your-app.com/troubleshooting/rate-limits"
}
```

**Doporučení:**
- [ ] Rozšířit `ApiError` class o `actionable` field
- [ ] Přidat mapping error codes → user-friendly hints
- [ ] Vytvořit error catalog pro Alfreda (knowledge base)

---

## 🧪 TESTOVACÍ SCÉNÁŘE (Co často selhává)

### 1. **Token Lifecycle Tests**
- [ ] Token expiry detection (5-min buffer)
- [ ] Concurrent refresh mutex (2 requests současně)
- [ ] Invalid grant handling (user změnil heslo)
- [ ] Refresh token rotation (Google vrací nový refresh token)
- [ ] 50-token limit simulation (vytvoř 51 tokenů, ověř že 1. failne)

### 2. **Database Resilience Tests**
- [ ] MongoDB restart během requestu
- [ ] Connection timeout (network blip)
- [ ] Concurrent writes (race condition)
- [ ] Encryption key mismatch (špatný klíč → decrypt fail)

### 3. **Google API Error Simulation**
- [ ] 401 Unauthorized → auto refresh + retry
- [ ] 429 Rate Limit → exponential backoff
- [ ] 500 Internal Server Error → retry with backoff
- [ ] Timeout (Gmail API nereaguje 60s)
- [ ] Partial response (incomplete JSON)

### 4. **OAuth Flow Security Tests**
- [ ] CSRF attack (špatný `state` parameter)
- [ ] Auth code reuse (použít stejný code 2x)
- [ ] Expired auth code (použít code po 10 minutách)
- [ ] Malicious redirect_uri
- [ ] Missing PKCE verification

### 5. **Production Load Tests**
- [ ] 100 concurrent users → rate limiter
- [ ] Large email batch (200 emails)
- [ ] Aggregate query (4000 calendar events)
- [ ] Background refresh (1000 users současně)

---

## 📊 MONITORING & ALERTING

### Kritické metriky k trackování:

1. **Token Health**
   - `refresh_failures_count` (počet failů za hodinu)
   - `tokens_expiring_soon` (tokeny expirující do 1h)
   - `revoked_tokens_count` (uživatelé s revoked refresh token)

2. **Database**
   - `db_connection_failures` (fail count)
   - `db_query_latency_p95` (95th percentile)
   - `db_connection_pool_exhausted` (pool full events)

3. **Google API**
   - `google_api_429_count` (rate limit errors)
   - `google_api_5xx_count` (server errors)
   - `google_api_latency_p99` (99th percentile)

4. **Application**
   - `request_rate` (requests/min)
   - `error_rate_4xx` a `error_rate_5xx`
   - `active_users_24h` (uživatelé s activity v posledních 24h)

---

## 🎯 AKČNÍ PLÁN (Prioritizace)

### 🔴 CRITICAL (Do 1 týdne)
1. **Implementovat PKCE pro OAuth flow** → Prevence auth code interception
2. **Přidat encryption key versioning** → Enable safe key rotation
3. **Strukturované logování** → Debugování v produkci
4. **Monitoring & alerting setup** → Detect failures proactively

### 🟠 HIGH (Do 1 měsíce)
5. **Database connection pooling** → Resilience při DB issues
6. **Exponential backoff pro Google API 429** → Handle rate limits gracefully
7. **Audit logging** → Compliance & forensics
8. **Unit tests pro token lifecycle** → Prevent regressions

### 🟡 MEDIUM (Do 3 měsíců)
9. **Alfred error hints** → Better UX při chybách
10. **Separate OAuth clients (dev/prod)** → Prevence 50-token limit
11. **Encrypt user emails** → GDPR compliance
12. **Circuit breaker pattern** → Graceful degradation

### 🟢 LOW (Nice to have)
13. **VirusTotal integration pro attachments** → Better malware detection
14. **Redis caching layer** → Multi-instance support
15. **Webhook notifications** → Proactive user alerts
16. **Geographic anomaly detection** → Account compromise detection

---

## 📝 ZÁVĚR

Vaše aplikace má **solidní foundation** s dobrými security practices (encryption, rate limiting, error handling). Hlavní rizika jsou v oblasti:

1. **Token management** (rotation, revocation handling)
2. **Observability** (logging, monitoring, alerting)
3. **Resilience** (DB connection, API failures)

**Doporučení:** Začněte s CRITICAL items (PKCE, key rotation, monitoring) a postupně implementujte zlepšení podle priorit.

**Overall Risk Score:** 🟡 **MEDIUM** (6/10) — Production-ready s rezervami pro hardening.
