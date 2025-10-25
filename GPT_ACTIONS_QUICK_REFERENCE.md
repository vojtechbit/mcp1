# 🤖 Alfred Actions — Quick Reference

> Tahák pro maintainery a buildery Custom GPT. Nekopíruj ho do instrukcí GPT — místo toho ho měj po ruce při testování, ladění nebo při vysvětlování schopností backendu.

---

## 🧭 Jak to zapadá do Custom GPT
- **Instrukce & konverzační startéry**: stále kopíruj z [`GPT_CONFIG.md`](GPT_CONFIG.md) do GPT Editoru.
- **Tento tahák**: zůstává v dokumentaci projektu. Je komplementární — shrnuje skutečné Actions, jejich parametry a typické odpovědi, aby Alfrédovy instrukce i UX seděly na reálné API.
- **OpenAPI**: zdroj pravdy je [`openapi-facade-final.json`](openapi-facade-final.json). Všechny příklady níže jsou s ním v souladu.

---

## 📮 Inbox & Email přehledy

### `/macros/inbox/overview` — stručné karty emailů
**Request body**
```json
{
  "timeRange": { "relative": "today" },
  "filters": {
    "from": "john@example.com",
    "hasAttachment": true
  },
  "maxItems": 50
}
```

**Response**
```json
{
  "items": [
    {
      "messageId": "1894be1e2a4c1a7d",
      "senderName": "John Smith",
      "senderAddress": "john@example.com",
      "subject": "Quarterly deck",
      "receivedAt": "2025-10-20T08:31:00Z",
      "inboxCategory": "work",
      "snippet": "Ahoj, posílám slíbenou prezentaci…"
    }
  ],
  "subset": false,
  "nextPageToken": null
}
```
> Pokud `subset` je `true`, v odpovědi vždy zmiň, že existují další emaily, a nabídni dočtení (`nextPageToken`).

### `/macros/inbox/snippets` — rozšířené preview s náhledy příloh
**Request body**
```json
{
  "timeRange": { "relative": "last24h" },
  "maxItems": 25
}
```

**Response**
```json
{
  "items": [
    {
      "messageId": "1894be1e2a4c1a7d",
      "senderName": "Billing Team",
      "senderAddress": "billing@example.com",
      "subject": "Invoice #2025-10",
      "receivedAt": "2025-10-19T20:02:00Z",
      "snippet": "Attached is the invoice for October…",
      "attachmentUrls": [
        "https://…/signed"
      ]
    }
  ],
  "subset": true
}
```
> `attachmentUrls` obsahuje přímo podepsané odkazy (platnost cca 1 hodinu). Pokud pole je prázdné, žádné přílohy nejsou.

---

## ✉️ Čtení emailů

### `/macros/email/quickRead` — kompletní text & přílohy
**Request body**
```json
{
  "ids": ["1894be1e2a4c1a7d"],
  "format": "full"
}
```

**Response (mode "single")**
```json
{
  "mode": "single",
  "item": {
    "messageId": "1894be1e2a4c1a7d",
    "subject": "Quarterly deck",
    "body": "Ahoj,\n\nposílám slíbenou prezentaci…",
    "attachments": [
      {
        "name": "deck.pdf",
        "mimeType": "application/pdf",
        "url": "https://…/signed",
        "blocked": false
      }
    ]
  }
}
```

**Response (mode "batch")**
```json
{
  "mode": "batch",
  "items": [
    {
      "messageId": "1894be1e2a4c1a7d",
      "subject": "Quarterly deck",
      "body": "…",
      "attachments": []
    },
    {
      "messageId": "1894bd3f9012aa7e",
      "subject": "Re: Quarterly deck",
      "body": "…",
      "attachments": []
    }
  ]
}
```
> Backend může přidat textové `note` (např. o zkrácení kvůli limitu). Pokud se objeví, předej informaci uživateli vlastními slovy.

---

## 👥 Kontakty

### `/macros/contacts/safeAdd` — bezpečné hromadné přidání
**Request body**
```json
{
  "entries": [
    {
      "name": "Marek Svoboda",
      "email": "marek@example.com",
      "phone": "+420777111222",
      "notes": "Nový lead z eventu"
    }
  ],
  "dedupeStrategy": "ask"
}
```

**Response**
```json
{
  "created": [
    {
      "name": "Marek Svoboda",
      "email": "marek@example.com"
    }
  ],
  "merged": [],
  "skipped": [
    {
      "email": "john@example.com",
      "name": "John Doe",
      "reason": "found duplicates",
      "existing": [
        {
          "name": "John Doe",
          "email": "john@example.com",
          "phone": "",
          "notes": "Old note"
        }
      ]
    }
  ],
  "confirmToken": "safeAdd-3f5cf1",
  "warnings": [
    "Found potential duplicates. Ask the user to create, merge, or skip."
  ]
}
```
> Pokud dorazí `confirmToken`, pokračuj přes `/api/macros/confirm`. Duplicity prezentuj z `skipped[].existing`.

> `dedupeStrategy` podporuje hodnoty `ask` (výchozí, dvoukrokové potvrzení), `skip`, `merge` a `create`.

### `/api/macros/confirm` — dokončení dvoukrokových toků
- **Preview:** `GET /api/macros/confirm/{token}`. Vrací `preview.availableActions` podle typu potvrzení.
- **Finalize:** `POST /api/macros/confirm` s `{ "confirmToken": "…", "action": "…" }`.
  - **Kalendář (enrichment):** `action` může být `"auto-fill"` nebo `"skip"`.
  - **Kontakty (safeAdd dedupe):** `action` může být `"create"`, `"merge"` nebo `"skip"`.

---

## 📅 Kalendář & Úkoly — přehled klíčových akcí
| Doména | Endpoint | Použití | Poznámky |
|--------|----------|---------|----------|
| Kalendář | `/macros/calendar/plan` | Navrhne termíny podle preferencí uživatele (bez zápisu) | Parametr `constraints` definuje časová okna, účastníky, délku meetingu. |
| Kalendář | `/macros/calendar/schedule` | Vytvoří událost podle zadaného slotu | Respektuj `idempotencyKey` z instrukcí, pokud posíláš opakovaně.<br>Při `enrichFromContacts:"ask"` vrací `confirmToken`; dokonči přes `/api/macros/confirm` s `action` `auto-fill/skip`. |
| Kalendář | `/macros/calendar/reminderDrafts` | Připraví draft emailů s připomenutím | Vrací návrhy textů + metadata událostí. |
| Úkoly | `/macros/tasks/overview` | Souhrn úkolů podle stavu/termínu | Odpověď obsahuje sekce `overdue`, `today`, `upcoming`. |
| Úkoly | `/tasks/actions/create` | Vytvoří konkrétní úkol | V requestu posílej `title`, volitelně `due`, `notes`. |

Detailní schémata viz OpenAPI.

---

## 🔁 Idempotence & stránkování v praxi
- Většina makro-endpointů se opírá o POST požadavky bez potřeby `Idempotency-Key`. Přidávej ji pouze tam, kde to schéma nebo instrukce výslovně říká (`contacts/actions/modify`, kalendářní zápisy při opakování požadavku).
- Pokud odpověď obsahuje `subset:true`, vždy nabídni pokračování pomocí stejné akce s `nextPageToken` (pokud je k dispozici) nebo vhodně zúž výběr.
- `snapshotToken` se objevuje u agregovaných RPC (`/rpc/mail`, `/rpc/calendar`) pro stabilní iteraci — předej ho do následných dotazů.

---

## ✅ Checklist pro testování Custom GPT
1. Zkontroluj, že schéma v GPT Editoru je aktuální (shodné s `openapi-facade-final.json`).
2. Proveď rychlý „smoke test“:
   - `/macros/inbox/overview` s `relative:"today"`
   - `/macros/email/quickRead` na ID z overview
   - `/macros/contacts/safeAdd` s duplicitou (ověř, že GPT správně popisuje `skipped`)
3. V instrukcích připomeň práci s `subset` a prezentaci duplicit (viz `instructionsalfred.md`).
4. Nech Quick Reference přiložený jako interní dokument — nepřidávej ho do promptu, aby GPT zbytečně neplýtval tokeny.

---

Potřebuješ hlubší detaily? Sáhni přímo do OpenAPI nebo do Playbooku (`playbooksalfred.md`). Tento tahák má sloužit jako rychlá kontrola, že dokumentace i GPT odpovědi odpovídají reálnému backendu.
