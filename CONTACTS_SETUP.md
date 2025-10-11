# 📋 Kontakty - Rychlý Setup

## 🎯 K čemu to je

GPT si pamatuje tvé kontakty, takže nemusíš diktovat emaily při každém posílání emailu.

---

## 📝 Setup (3 kroky)

### 1. Vytvoř Google Sheet
- Jdi na https://sheets.google.com
- Vytvoř nový sheet
- Pojmenuj ho **PŘESNĚ**: `MCP1 Contacts`

### 2. Nastav sloupce

V prvním řádku udělej tyto hlavičky:

| Name          | Email              | Notes             |
|---------------|-------------------|-------------------|
| Michal Sopor  | moso@gmail.com    | personal, kamarád |
| Michal Sopor  | moso@seznam.cz    | work, firma ABC   |
| Jan Novák     | jan@company.com   | práce             |
| Petra         | petra@gmail.com   |                   |

**Notes sloupec je optional** - může být prázdný nebo obsahovat cokoliv (personal, work, firemní 1, firma XYZ, atd.)

### 3. Hotovo!
Sheet se automaticky napojí přes OAuth. Žádné sdílení není potřeba.

---

## 💡 Jak to funguje

```
User: "Pošli email Michalovi"
GPT: "Našel jsem 2 emaily:
     - moso@gmail.com (personal, kamarád)
     - moso@seznam.cz (work, firma ABC)
     Který chceš použít?"

User: "Ten pracovní"
GPT: "OK, použiju moso@seznam.cz"
```

**Filtrování podle Notes:**
```
User: "Pošli pracovní email Michalovi"
GPT: *vyhledá "work" v Notes a automaticky vybere moso@seznam.cz*
```

---

## ⚡ Tipy

- GPT hledá i v Notes sloupci - můžeš filtrovat podle čehokoliv co tam dáš
- Přidávat kontakty můžeš přímo přes GPT: *"Přidej kontakt Honza Novák, email honza@firma.cz, poznámka klient"*
- Sheet může mít i víc emailů pro stejnou osobu

**Hotovo! 🚀**
