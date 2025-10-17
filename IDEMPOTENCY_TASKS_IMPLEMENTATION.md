# Idempotency + Tasks Enhancement - Implementation Complete

**Date:** October 18, 2025  
**Version:** 2.2.0

## Overview

Implementace idempotency keys pro všechny mutace a rozšíření Tasks API o aggregate + snapshot podporu.

---

## 1. Idempotency Keys

### Implementace

**Nový soubor:** `src/middleware/idempotencyMiddleware.js`

### Chování

- **Přijímání klíče:** `Idempotency-Key` hlavička nebo `body.idempotency_key`
- **Fingerprint:** `sha256(method + path + canonicalJson(body bez idempotency_key a timestamps))`
- **MongoDB kolekce:** `idempotency_records`
  - Unique index: `(key, method, path)`
  - TTL index: `createdAt` → 12 hodin

### Logika

1. **První výskyt** (není záznam)
   - Proveď akci
   - Ulož `{key, method, path, fingerprint, status, body, createdAt}`
   - Vrať výsledek

2. **Stejný fingerprint**
   - **Neprováděj akci znovu**
   - Vrať uložený výsledek (stejný status + body)
   - Log: `🔄 [IDEMPOTENCY] HIT`

3. **Jiný fingerprint se stejným key**
   - Vrať **409 IDEMPOTENCY_KEY_REUSE_MISMATCH**
   - Log: `⚠️  [IDEMPOTENCY] CONFLICT`

### Aplikace

Middleware aplikován globálně na všechny `/api/*` routes:
- ✅ POST `/gmail/send`
- ✅ POST `/gmail/reply/:messageId`
- ✅ POST `/gmail/draft`
- ✅ PATCH `/gmail/:messageId/star`
- ✅ PATCH `/gmail/:messageId/read`
- ✅ DELETE `/gmail/:messageId`
- ✅ POST `/calendar/events`
- ✅ PATCH `/calendar/events/:eventId`
- ✅ DELETE `/calendar/events/:eventId`
- ✅ POST `/contacts/bulkUpsert`
- ✅ POST `/contacts/bulkDelete`
- ✅ POST `/contacts`
- ✅ PUT `/contacts`
- ✅ DELETE `/contacts`
- ✅ POST `/tasks`
- ✅ PATCH `/tasks/:taskListId/:taskId`
- ✅ DELETE `/tasks/:taskListId/:taskId`

**GETy jsou ignorovány automaticky** (middleware kontroluje metodu).

### Příklady použití

#### Úspěšné poslání emailu

```bash
# První požadavek
curl -X POST http://localhost:3000/api/gmail/send \
  -H "Idempotency-Key: msg-123-abc" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "subject": "Test",
    "body": "Hello"
  }'

# Odpověď: 200 OK + messageId

# Retry se stejným key a body
curl -X POST http://localhost:3000/api/gmail/send \
  -H "Idempotency-Key: msg-123-abc" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "subject": "Test",
    "body": "Hello"
  }'

# Odpověď: 200 OK + STEJNÝ messageId (email NENÍ poslán znovu)
```

#### Konflikt (reuse key s jiným payload)

```bash
# Pokus použít stejný key s jiným body
curl -X POST http://localhost:3000/api/gmail/send \
  -H "Idempotency-Key: msg-123-abc" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "subject": "Different Subject",
    "body": "Different body"
  }'

# Odpověď: 409 IDEMPOTENCY_KEY_REUSE_MISMATCH
{
  "error": "Idempotency key reuse mismatch",
  "code": "IDEMPOTENCY_KEY_REUSE_MISMATCH",
  "message": "This idempotency key was already used with a different request body. Please use a new key for a different request."
}
```

### Logging

- **HIT:** `🔄 [IDEMPOTENCY] HIT - Key: abc123..., Method: POST, Path: /gmail/send`
- **MISS:** `✨ [IDEMPOTENCY] MISS - Key: xyz789..., Method: POST, Path: /calendar/events`
- **CONFLICT:** `⚠️  [IDEMPOTENCY] CONFLICT - Key: abc123..., Method: POST, Path: /gmail/send`

**Key je hashován** v logách pro privacy (SHA-256, prvních 16 znaků).

---

## 2. Tasks API - Aggregate Mode

### Nové parametry

- `aggregate=true` (opt-in)
- `maxResults` (page size)
- `pageToken` (pro normální paging)
- `showCompleted=true` (zobraz i dokončené)

### Chování

#### Bez aggregate (normální paging):

```bash
GET /api/tasks?maxResults=10

# Odpověď:
{
  "success": true,
  "items": [...],
  "hasMore": true,
  "nextPageToken": "abc123"
}
```

#### S aggregate=true:

```bash
GET /api/tasks?aggregate=true

# Odpověď:
{
  "success": true,
  "items": [...],
  "totalExact": 156,
  "pagesConsumed": 16,
  "hasMore": false,
  "partial": false,
  "snapshotToken": "snap_xyz789"
}
```

### Agregační limit

- **AGGREGATE_CAP_TASKS:** 1000 úkolů
- Pokud limit dosažen: `partial=true`, `hasMore=true`

---

## 3. Tasks API - Snapshot Tokens

### Parametry

- `snapshotToken=...` (použij snapshot)
- `ignoreSnapshot=true` (ignoruj snapshot, fresh data)

### Chování

#### Bez tokenu (nebo s ignoreSnapshot=true):

```bash
GET /api/tasks
# → Live data (čerstvá)
```

#### Se snapshotToken:

```bash
GET /api/tasks?snapshotToken=snap_xyz789
# → Zmražená data (konzistentní členství/pořadí)
# TTL: ~120 sekund
```

#### Snapshot expirován:

```bash
GET /api/tasks?snapshotToken=snap_expired
# → 400 Bad Request
{
  "error": "Invalid or expired snapshot token",
  "message": "Please start a new query"
}
```

### TTL

- **SNAPSHOT_TTL_MS:** 120 000 ms (2 minuty)
- Automatické čištění každých 60 sekund

---

## 4. Email-Specific Behavior

### Pravidla pro Idempotency Keys

1. **Každý nový email = nový key**
   ```bash
   # Email 1
   Idempotency-Key: msg-001
   
   # Email 2 (jiný příjemce/subject/body)
   Idempotency-Key: msg-002
   ```

2. **Stejný příjemce, jiný obsah = nový key**
   ```bash
   # Pokud použiješ stejný key → 409 CONFLICT
   ```

3. **Re-try = stejný key**
   ```bash
   # Selhání sítě → retry se STEJNÝM key
   # → Vrátí původní výsledek, nepošle znovu
   ```

---

## Soubory Changed

### Nové soubory:
- `src/middleware/idempotencyMiddleware.js` - Idempotency middleware

### Upravené soubory:
- `src/routes/apiRoutes.js` - Aplikace idempotency middleware
- `src/controllers/tasksController.js` - Aggregate + snapshot support
- `src/services/tasksService.js` - Přidána `listTasks()` s paging
- `src/config/limits.js` - Přidán `AGGREGATE_CAP_TASKS`

---

## MongoDB Kolekce

### idempotency_records

```javascript
{
  _id: ObjectId,
  key: "msg-123-abc",           // Idempotency key
  method: "POST",                 // HTTP method
  path: "/gmail/send",            // Request path
  fingerprint: "abc123...",       // SHA-256 hash
  status: 200,                    // Response status
  body: { ... },                  // Response body
  createdAt: ISODate              // TTL index (12h)
}
```

**Indexes:**
- Unique: `{ key: 1, method: 1, path: 1 }`
- TTL: `{ createdAt: 1 }` → expireAfterSeconds: 43200 (12h)

---

## Testing

### Idempotency Test

```bash
# 1. První požadavek
curl -X POST http://localhost:3000/api/gmail/send \
  -H "Idempotency-Key: test-001" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","subject":"Test","body":"Hello"}'

# 2. Retry (stejný key, stejný body)
# → Vrátí stejný výsledek, NEPOŠLE znovu

# 3. Jiný body (stejný key)
# → 409 CONFLICT
```

### Tasks Aggregate Test

```bash
# Aggregate mode
curl http://localhost:3000/api/tasks?aggregate=true

# Očekávaný výstup:
# - totalExact: číslo
# - pagesConsumed: číslo
# - partial: boolean
# - snapshotToken: string
```

### Snapshot Test

```bash
# 1. Získej snapshot token
SNAP=$(curl -s http://localhost:3000/api/tasks?aggregate=true | jq -r '.snapshotToken')

# 2. Použij snapshot
curl "http://localhost:3000/api/tasks?snapshotToken=$SNAP"

# 3. Po 2 minutách → 400 (expired)
```

---

## Migration Notes

**Pro existující deployments:**
- ✅ Zero breaking changes
- ✅ Idempotency je opt-in (klíč není povinný)
- ✅ Tasks API zpětně kompatibilní (agregace je opt-in)
- ✅ Automatické vytvoření MongoDB indexů při prvním použití

**Nové features jsou opt-in:**
- Idempotency: Přidej `Idempotency-Key` hlavičku
- Aggregate: Přidej `?aggregate=true`
- Snapshot: Použij vrácený `snapshotToken`

---

## Performance

- **Idempotency:** +1 MongoDB dotaz na mutaci (lookup)
- **Aggregate:** N stránek × Google API calls (limitováno AGGREGATE_CAP_TASKS)
- **Snapshot:** In-memory store, minimální overhead
- **TTL cleanup:** Automatický (MongoDB), žádný ruční overhead

---

## Future Enhancements

- Redis-based idempotency store pro multi-instance
- Idempotency key generování na straně klienta (UUID v4)
- Metrics: hit rate, conflict rate
- Extended TTL options (konfigurovatelný TTL)

---

**Status:** ✅ **COMPLETE**  
**Ready for production:** Yes  
**Breaking changes:** None

