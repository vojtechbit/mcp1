import express from 'express';

const router = express.Router();

/**
 * Privacy Policy endpoint (GDPR compliant - CZ + EN)
 * GET /privacy-policy
 * 
 * Updated: October 12, 2025
 * Complete coverage: Gmail, Calendar, Tasks, Contacts (Sheets), Drive
 */
router.get('/privacy-policy', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zásady ochrany osobních údajů | Privacy Policy - MCP1</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
      background: #f9f9f9;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 15px;
      font-size: 2em;
    }
    h2 {
      color: #34495e;
      margin-top: 35px;
      font-size: 1.5em;
    }
    h3 {
      color: #555;
      margin-top: 25px;
      font-size: 1.2em;
    }
    .last-updated {
      color: #7f8c8d;
      font-style: italic;
      margin-bottom: 30px;
      background: #ecf0f1;
      padding: 10px;
      border-radius: 4px;
    }
    .section {
      margin-bottom: 25px;
    }
    ul {
      margin-left: 20px;
    }
    li {
      margin-bottom: 8px;
    }
    .highlight {
      background-color: #fff3cd;
      padding: 15px;
      border-left: 4px solid #ffc107;
      margin: 20px 0;
    }
    .contact {
      background-color: #e8f4f8;
      padding: 20px;
      border-radius: 5px;
      margin-top: 30px;
    }
    .important {
      background-color: #ffe6e6;
      padding: 15px;
      border-left: 4px solid #e74c3c;
      margin: 20px 0;
    }
    .feature-box {
      background-color: #e8f5e9;
      padding: 15px;
      border-left: 4px solid #4caf50;
      margin: 20px 0;
    }
    .lang-divider {
      border-top: 3px solid #95a5a6;
      margin: 60px 0;
      padding-top: 40px;
    }
    strong {
      color: #2c3e50;
    }
    a {
      color: #3498db;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .footer {
      text-align: center;
      color: #7f8c8d;
      font-size: 14px;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 10px;
      border: 1px solid #ddd;
      text-align: left;
    }
    th {
      background: #ecf0f1;
    }
  </style>
</head>
<body>
  <div class="container">
    
    <!-- ============================================ -->
    <!-- ČESKÁ VERZE -->
    <!-- ============================================ -->
    
    <h1>🔐 Zásady ochrany osobních údajů</h1>
    <p class="last-updated">Poslední aktualizace: 12. října 2025</p>

    <div class="highlight">
      <strong>Stručně:</strong> Přistupujeme k vašim datům Gmail, Google Kalendář, Google Tasks a Google Sheets pouze když to explicitně požadujete. 
      Všechny tokeny šifrujeme pomocí AES-256-GCM. Vaše data nikdy neprodáváme ani nepoužíváme pro jiné účely než poskytování služby. 
      Přístup můžete kdykoliv zrušit přes nastavení Google účtu.
    </div>

    <div class="section">
      <h2>1. Správce osobních údajů</h2>
      <p><strong>Správce:</strong> Vojtěch Brouček</p>
      <p><strong>Adresa:</strong> U Hvězdy 2292, Kladno, Česká republika</p>
      <p><strong>Kontakt:</strong> GitHub: <a href="https://github.com/vojtechbit/mcp1" target="_blank">github.com/vojtechbit/mcp1</a></p>
      <p><strong>URL služby:</strong> <a href="https://mcp1-oauth-server.onrender.com">mcp1-oauth-server.onrender.com</a></p>
    </div>

    <div class="section">
      <h2>2. Úvod</h2>
      <p>
        MCP1 Gmail & Calendar OAuth Server ("služba", "my", "naše") je OAuth proxy server, který 
        umožňuje ChatGPT Custom GPT Actions přistupovat k vašemu Google Workspace (Gmail, Kalendář, Tasks, Sheets, Drive) vaším jménem. 
        Tyto zásady vysvětlují, jak shromažďujeme, používáme, ukládáme a chráníme vaše informace v souladu s <strong>GDPR 
        (nařízení EU 2016/679)</strong> a <strong>českým zákonem č. 110/2019 Sb.</strong> o zpracování osobních údajů.
      </p>
    </div>

    <div class="section">
      <h2>3. Právní základ zpracování (GDPR Article 6)</h2>
      <p>Vaše osobní údaje zpracováváme na základě:</p>
      <ul>
        <li><strong>Souhlas (Article 6(1)(a)):</strong> Udělujete nám výslovný souhlas přes Google OAuth flow při první autentizaci</li>
        <li><strong>Plnění smlouvy (Article 6(1)(b)):</strong> Zpracování je nezbytné pro poskytování služby, kterou jste si objednali</li>
        <li><strong>Oprávněný zájem (Article 6(1)(f)):</strong> Zabezpečení služby, prevence zneužití, technické logování</li>
      </ul>
      <p>Můžete kdykoli odvolat svůj souhlas prostřednictvím <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a>. 
      Odvolání souhlasu nemá vliv na zákonnost zpracování před jeho odvoláním.</p>
    </div>

    <div class="section">
      <h2>4. Jaké informace sbíráme</h2>
      
      <h3>4.1 OAuth Autentizační údaje (povinné)</h3>
      <p>Při autentizaci s Google OAuth 2.0 šifrovaně ukládáme:</p>
      <ul>
        <li><strong>Google OAuth Access Token</strong> - Dočasný token (1 hodina) pro přístup k vašim datům</li>
        <li><strong>Google OAuth Refresh Token</strong> - Dlouhodobý token pro obnovení přístupu</li>
        <li><strong>Google User ID (sub)</strong> - Váš unikátní identifikátor Google účtu</li>
        <li><strong>E-mailová adresa</strong> - Primární e-mail vašeho Google účtu</li>
        <li><strong>Token Expiry Date</strong> - Datum expirace access tokenu</li>
      </ul>

      <h3>4.2 Technická a provozní data</h3>
      <ul>
        <li>API Request Logs (časové razítko, endpoint, user ID)</li>
        <li>Token Usage Logs (časová razítka použití a obnovení tokenů)</li>
        <li>Error Logs (pro debugging, neobsahují citlivý obsah)</li>
        <li>Last Used Timestamp (pro automatické čištění neaktivních účtů)</li>
        <li>Authorization Code (dočasný kód, 10 minut)</li>
        <li>Proxy Tokens (dočasné tokeny, 30 dní)</li>
      </ul>

      <h3>4.3 Google API Scopes (oprávnění)</h3>
      <p>Aplikace požaduje následující oprávnění:</p>
      <ul>
        <li><strong>https://mail.google.com/</strong> - Plný přístup k Gmail</li>
        <li><strong>https://www.googleapis.com/auth/calendar</strong> - Plný přístup ke Kalendáři</li>
        <li><strong>https://www.googleapis.com/auth/tasks</strong> - Plný přístup k Tasks</li>
        <li><strong>https://www.googleapis.com/auth/spreadsheets</strong> - Přístup k Google Sheets</li>
        <li><strong>https://www.googleapis.com/auth/drive.file</strong> - Omezený přístup k Drive (jen pro Sheets s kontakty)</li>
        <li><strong>openid, email, profile</strong> - Základní informace o profilu</li>
      </ul>

      <h3>4.4 Funkce které zpracováváme na váš požadavek</h3>
      
      <div class="feature-box">
        <strong>📧 Gmail operace:</strong>
        <ul>
          <li>Odesílání emailů (to, cc, bcc, subject, body)</li>
          <li>Čtení emailů (obsah, hlavičky, metadata)</li>
          <li>Vyhledávání emailů (podle dotazu)</li>
          <li>Odpovídání na emaily (reply, reply-all)</li>
          <li>Vytváření konceptů emailů (drafts)</li>
          <li>Mazání emailů (přesun do koše)</li>
          <li>Označování emailů hvězdičkou (star/unstar)</li>
          <li>Označování jako přečtené/nepřečtené (read/unread)</li>
        </ul>
      </div>

      <div class="feature-box">
        <strong>📅 Kalendář operace:</strong>
        <ul>
          <li>Vytváření událostí (summary, start, end, description, location, attendees, reminders)</li>
          <li>Čtení jednotlivých událostí (všechna pole)</li>
          <li>Výpis událostí (s filtry podle času, dotazu)</li>
          <li>Aktualizace událostí (změna času, popisu, účastníků)</li>
          <li>Mazání událostí</li>
        </ul>
      </div>

      <div class="feature-box">
        <strong>✅ Google Tasks operace:</strong>
        <ul>
          <li>Výpis všech úkolů ze všech seznamů</li>
          <li>Vytváření nových úkolů (title, notes, due date)</li>
          <li>Aktualizace úkolů (změna titulku, poznámek, data, stavu)</li>
          <li>Označování úkolů jako dokončených/nedokončených</li>
          <li>Mazání úkolů</li>
        </ul>
      </div>

      <div class="feature-box">
        <strong>👥 Kontakty (Google Sheets) operace:</strong>
        <ul>
          <li>Vyhledávání kontaktů v Google Sheets (podle jména, emailu)</li>
          <li>Výpis všech kontaktů ze Sheets</li>
          <li>Přidávání nových kontaktů (jméno, email, poznámky)</li>
          <li>Aktualizace kontaktů (změna poznámek)</li>
          <li>Vyhledávání Sheets s názvem "MCP1 Contacts" v Google Drive</li>
          <li>Vytváření nového Sheets "MCP1 Contacts" pokud neexistuje</li>
        </ul>
      </div>

      <h3>4.5 Co NIKDY nesbíráme</h3>
      <ul>
        <li>❌ Obsah emailů bez vašeho explicitního požadavku</li>
        <li>❌ Přílohy emailů bez vašeho explicitního požadavku</li>
        <li>❌ Detaily kalendářových událostí bez vašeho explicitního požadavku</li>
        <li>❌ Obsah úkolů bez vašeho explicitního požadavku</li>
        <li>❌ Obsah Google Sheets bez vašeho explicitního požadavku</li>
        <li>❌ Soubory z Google Drive (kromě Sheets pro kontakty)</li>
        <li>❌ Historii prohlížení nebo cookies</li>
        <li>❌ Citlivé údaje podle GDPR Article 9 (zdravotní stav, náboženství atd.)</li>
      </ul>
    </div>

    <div class="section">
      <h2>5. Jak používáme vaše informace</h2>
      <p>Vaše informace používáme výhradně k poskytování služby:</p>
      
      <h3>5.1 Primární účel</h3>
      <ul>
        <li>✅ Autentizace vašich požadavků přes ChatGPT Custom GPT</li>
        <li>✅ Provádění Gmail operací které explicitně požadujete</li>
        <li>✅ Provádění Kalendář operací které explicitně požadujete</li>
        <li>✅ Správa úkolů v Google Tasks na váš požadavek</li>
        <li>✅ Správa kontaktů ve vašich Google Sheets na váš požadavek</li>
        <li>✅ Udržování vaší session a automatické obnovování tokenů</li>
      </ul>

      <h3>5.2 Technické účely</h3>
      <ul>
        <li>✅ Debugging problémů pro zlepšování služby</li>
        <li>✅ Vynucování rate limitů (max. 100 požadavků/hodinu)</li>
        <li>✅ Zabezpečení proti neautorizovanému přístupu</li>
      </ul>
      
      <div class="important">
        <strong>Důležité - NIKDY NEpoužíváme vaše data pro:</strong>
        <ul>
          <li>❌ Čtení emailů, kalendáře nebo úkolů bez vašeho explicitního příkazu</li>
          <li>❌ Sdílení s třetími stranami (kromě nezbytných poskytovatelů infrastruktury)</li>
          <li>❌ Reklamu, marketing nebo profilování</li>
          <li>❌ Prodej nebo pronájem informací</li>
          <li>❌ Trénování AI modelů</li>
        </ul>
      </div>
    </div>

    <div class="section">
      <h2>6. Ukládání a zabezpečení dat</h2>
      
      <h3>6.1 Šifrování a bezpečnost</h3>
      <ul>
        <li><strong>Data at Rest:</strong> Všechny OAuth tokeny jsou šifrovány pomocí <strong>AES-256-GCM encryption</strong></li>
        <li><strong>Data in Transit:</strong> Veškerá komunikace používá <strong>TLS 1.3</strong></li>
        <li><strong>Key Management:</strong> Šifrovací klíče uloženy odděleně od databáze</li>
        <li><strong>Access Control:</strong> Vícevrstvá autentizace (OAuth 2.0 + proxy token validation)</li>
        <li><strong>Rate Limiting:</strong> Max. 100 požadavků/hodinu/uživatel</li>
      </ul>

      <h3>6.2 Místo uložení</h3>
      <ul>
        <li><strong>Databáze:</strong> MongoDB Atlas (USA, certifikace SOC 2, ISO 27001)</li>
        <li><strong>Server:</strong> Render.com (USA, certifikace SOC 2)</li>
        <li><strong>Backup:</strong> Automatické zálohy každých 24 hodin, uchovávané 30 dní</li>
      </ul>
      
      <p><strong>Důležité:</strong> Vaše skutečná Gmail/Calendar data nikdy neopouštějí Google servery. 
      Ukládáme pouze autentizační tokeny, nikoli samotný obsah.</p>

      <h3>6.3 Kontrola přístupu</h3>
      <ul>
        <li>✅ Pouze autentizovaní uživatelé mají přístup ke svým vlastním datům</li>
        <li>✅ Žádný manuální přístup administrátorů k šifrovaným tokenům</li>
        <li>✅ Logging všech přístupů k databázi pro audit</li>
        <li>✅ Automatické čištění expirovaných tokenů</li>
      </ul>
    </div>

    <div class="section">
      <h2>7. Mezinárodní přenosy dat (GDPR Chapter V)</h2>
      <p>
        Vaše data jsou ukládána na serverech v USA (MongoDB Atlas, Render.com), což představuje mezinárodní přenos 
        mimo Evropský hospodářský prostor (EEA).
      </p>
      
      <h3>7.1 Právní základ pro přenos</h3>
      <p>Přenosy jsou prováděny v souladu s GDPR Article 46 na základě:</p>
      <ul>
        <li><strong>EU-US Data Privacy Framework (DPF):</strong> MongoDB Atlas a Render.com jsou certifikovaní účastníci DPF</li>
        <li><strong>Standard Contractual Clauses (SCCs):</strong> Dodatečná smluvní ochrana podle rozhodnutí Komise EU</li>
        <li><strong>Technické záruky:</strong> Šifrování end-to-end a minimalizace dat</li>
      </ul>
    </div>

    <div class="section">
      <h2>8. Doba uchovávání dat (GDPR Article 5(1)(e))</h2>
      <table>
        <tr>
          <th>Typ dat</th>
          <th>Doba uchovávání</th>
          <th>Důvod</th>
        </tr>
        <tr>
          <td>OAuth Access Token</td>
          <td>1 hodina</td>
          <td>Google API bezpečnostní standard</td>
        </tr>
        <tr>
          <td>OAuth Refresh Token</td>
          <td>Dokud nezrušíte přístup nebo 180 dní neaktivity</td>
          <td>Udržení přístupu bez opětovného přihlášení</td>
        </tr>
        <tr>
          <td>Authorization Code</td>
          <td>10 minut</td>
          <td>OAuth flow bezpečnost</td>
        </tr>
        <tr>
          <td>Proxy Token</td>
          <td>30 dní</td>
          <td>ChatGPT session management</td>
        </tr>
        <tr>
          <td>API Request Logs</td>
          <td>90 dní</td>
          <td>Debugging a bezpečnostní audit</td>
        </tr>
      </table>
      
      <p><strong>Automatické čištění:</strong> Pokud se nepřihlásíte 180 dní, váš účet a všechna data 
      budou automaticky smazána. O blížící se expiraci vás upozorníme emailem 30 dní předem.</p>
    </div>

    <div class="section">
      <h2>9. Vaše práva podle GDPR</h2>
      
      <h3>9.1 Přístup a kontrola nad daty (GDPR Articles 15-22)</h3>
      <ul>
        <li><strong>✅ Právo na přístup (Article 15):</strong> Vyžádat kopii všech osobních údajů</li>
        <li><strong>✅ Právo na opravu (Article 16):</strong> Opravit nesprávné nebo neúplné údaje</li>
        <li><strong>✅ Právo na výmaz (Article 17):</strong> Požádat o okamžité smazání všech dat ("právo být zapomenut")</li>
        <li><strong>✅ Právo na omezení (Article 18):</strong> Dočasně pozastavit zpracování</li>
        <li><strong>✅ Právo na přenositelnost (Article 20):</strong> Získat data ve strukturovaném formátu (JSON)</li>
        <li><strong>✅ Právo vznést námitku (Article 21):</strong> Vznést námitku proti zpracování</li>
        <li><strong>✅ Právo odvolat souhlas:</strong> Kdykoliv odvolat souhlas bez udání důvodu</li>
      </ul>

      <h3>9.2 Jak uplatnit svá práva</h3>
      
      <p><strong>Odvolání souhlasu a zrušení přístupu:</strong></p>
      <ol>
        <li>Navštivte <a href="https://myaccount.google.com/permissions" target="_blank">Google Account → Zabezpečení → Aplikace třetích stran</a></li>
        <li>Najděte "MCP1 OAuth Server"</li>
        <li>Klikněte na "Odebrat přístup"</li>
        <li>Vaše tokeny budou okamžitě zneplatněny</li>
      </ol>

      <p><strong>Úplné smazání dat:</strong> Kontaktujte nás na GitHub s požadavkem na smazání. Data smažeme do 30 dnů.</p>

      <h3>9.3 Právo podat stížnost (GDPR Article 77)</h3>
      <div class="contact">
        <strong>Úřad pro ochranu osobních údajů (ÚOOÚ)</strong><br>
        Pplk. Sochora 27<br>
        170 00 Praha 7<br>
        Tel: +420 234 665 111<br>
        E-mail: posta@uoou.cz<br>
        Web: <a href="https://uoou.gov.cz" target="_blank">uoou.gov.cz</a>
      </div>
      
      <p><strong>Doba odpovědi:</strong> Na všechny vaše požadavky odpovíme do 30 dnů.</p>
    </div>

    <div class="section">
      <h2>10. Automatizované rozhodování (GDPR Article 22)</h2>
      <p>
        <strong>Nepoužíváme automatizované rozhodování ani profilování.</strong> Všechny akce jsou prováděny 
        výhradně na základě vašich explicitních příkazů prostřednictvím ChatGPT.
      </p>
    </div>

    <div class="section">
      <h2>11. Google API Services User Data Policy</h2>
      <p>
        Použití a přenos informací získaných z Google APIs striktně dodržuje 
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank">
          Google API Services User Data Policy
        </a>, včetně požadavků <strong>Limited Use</strong>.
      </p>
      
      <div class="important">
        <strong>Limited Use Disclosure:</strong>
        <ul>
          <li>✅ Přístup k datům pouze když explicitně požadujete akci</li>
          <li>✅ Data výhradně pro poskytování služby</li>
          <li>✅ Bez sdílení s třetími stranami (kromě Google, MongoDB, Render)</li>
          <li>✅ Bez reklam</li>
          <li>✅ Bez marketingu</li>
        </ul>
      </div>
    </div>

    <div class="section">
      <h2>12. Služby třetích stran (GDPR Article 28)</h2>
      <table>
        <tr>
          <th>Služba</th>
          <th>Účel</th>
          <th>Místo</th>
          <th>Záruky</th>
        </tr>
        <tr>
          <td>Google LLC</td>
          <td>OAuth, Gmail/Calendar/Tasks/Sheets/Drive API</td>
          <td>USA, EU</td>
          <td>DPF, SCCs, ISO 27001</td>
        </tr>
        <tr>
          <td>MongoDB Atlas</td>
          <td>Šifrované uložení tokenů</td>
          <td>USA</td>
          <td>DPF, SCCs, SOC 2, ISO 27001</td>
        </tr>
        <tr>
          <td>Render.com</td>
          <td>Hosting serveru</td>
          <td>USA</td>
          <td>DPF, SCCs, SOC 2</td>
        </tr>
        <tr>
          <td>OpenAI ChatGPT</td>
          <td>Uživatelské rozhraní</td>
          <td>USA</td>
          <td>DPF, enterprise policies</td>
        </tr>
      </table>
    </div>

    <div class="section">
      <h2>13. Ochrana dětí (GDPR Article 8)</h2>
      <p>
        Služba není určena pro uživatele mladší <strong>18 let</strong>. Vědomě neshromažďujeme 
        informace od dětí. Pokud jste rodič a zjistíte, že vaše dítě poskytlo údaje, kontaktujte nás. 
        Data smažeme do 48 hodin.
      </p>
    </div>

    <div class="section">
      <h2>14. Změny těchto zásad</h2>
      <p>Tyto zásady můžeme aktualizovat. O změnách vás budeme informovat:</p>
      <ul>
        <li>📧 Email notifikace na vaši Google adresu</li>
        <li>📅 Aktualizace data "Poslední aktualizace"</li>
        <li>⏳ Zveřejnění nové verze minimálně 30 dní před nabytím účinnosti</li>
      </ul>
    </div>

    <div class="section">
      <h2>15. Oznámení o narušení zabezpečení (GDPR Articles 33-34)</h2>
      <p>V případě data breach:</p>
      <ul>
        <li>Oznámíme ÚOOÚ do 72 hodin</li>
        <li>Oznámíme dotčeným uživatelům bezodkladně</li>
        <li>Popíšeme povahu narušení</li>
        <li>Poskytneme doporučení pro ochranu účtu</li>
      </ul>
    </div>

    <div class="contact">
      <h2>16. Kontakt</h2>
      <ul>
        <li><strong>Správce:</strong> Vojtěch Brouček</li>
        <li><strong>Adresa:</strong> U Hvězdy 2292, Kladno, Česká republika</li>
        <li><strong>GitHub:</strong> <a href="https://github.com/vojtechbit/mcp1" target="_blank">github.com/vojtechbit/mcp1</a></li>
        <li><strong>Doba odpovědi:</strong> 30 dní</li>
      </ul>
    </div>

    <!-- ============================================ -->
    <!-- ENGLISH VERSION -->
    <!-- ============================================ -->

    <div class="lang-divider">
      <h1>🔐 Privacy Policy</h1>
      <p class="last-updated">Last Updated: October 12, 2025</p>

      <div class="highlight">
        <strong>TL;DR:</strong> We only access your Gmail, Calendar, Tasks, and Sheets data when you explicitly request it. 
        We encrypt all tokens with AES-256-GCM. We never sell your data. You can revoke access anytime.
      </div>

      <div class="section">
        <h2>1. Data Controller</h2>
        <p><strong>Controller:</strong> Vojtěch Brouček</p>
        <p><strong>Address:</strong> U Hvězdy 2292, Kladno, Czech Republic</p>
        <p><strong>Contact:</strong> <a href="https://github.com/vojtechbit/mcp1" target="_blank">github.com/vojtechbit/mcp1</a></p>
        <p><strong>Service URL:</strong> <a href="https://mcp1-oauth-server.onrender.com">mcp1-oauth-server.onrender.com</a></p>
      </div>

      <div class="section">
        <h2>2. Introduction</h2>
        <p>
          MCP1 is an OAuth proxy server enabling ChatGPT Custom GPT Actions to interact with your Google Workspace 
          (Gmail, Calendar, Tasks, Sheets, Drive) on your behalf, in compliance with <strong>GDPR (EU 2016/679)</strong> 
          and <strong>Czech Act No. 110/2019 Coll.</strong>
        </p>
      </div>

      <div class="section">
        <h2>3. Legal Basis (GDPR Article 6)</h2>
        <ul>
          <li><strong>Consent (6(1)(a)):</strong> You provide explicit consent via Google OAuth</li>
          <li><strong>Contract (6(1)(b)):</strong> Processing necessary to provide the service</li>
          <li><strong>Legitimate Interest (6(1)(f)):</strong> Security, abuse prevention, technical logging</li>
        </ul>
        <p>You can withdraw consent anytime via <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a>.</p>
      </div>

      <div class="section">
        <h2>4. Information We Collect</h2>
        
        <h3>4.1 OAuth Authentication Data</h3>
        <ul>
          <li><strong>Access Tokens</strong> - Temporary (1 hour)</li>
          <li><strong>Refresh Tokens</strong> - Long-lived</li>
          <li><strong>Google User ID</strong> - Your unique identifier</li>
          <li><strong>Email Address</strong> - Your Google account email</li>
        </ul>

        <h3>4.2 Technical Data</h3>
        <ul>
          <li>API Request Logs (timestamp, endpoint, user ID)</li>
          <li>Token usage timestamps</li>
          <li>Error logs (for debugging)</li>
          <li>Last used timestamp</li>
        </ul>

        <h3>4.3 API Scopes (Permissions)</h3>
        <ul>
          <li><strong>https://mail.google.com/</strong> - Full Gmail access</li>
          <li><strong>https://www.googleapis.com/auth/calendar</strong> - Full Calendar access</li>
          <li><strong>https://www.googleapis.com/auth/tasks</strong> - Full Tasks access</li>
          <li><strong>https://www.googleapis.com/auth/spreadsheets</strong> - Sheets access</li>
          <li><strong>https://www.googleapis.com/auth/drive.file</strong> - Limited Drive access</li>
          <li><strong>openid, email, profile</strong> - Basic profile info</li>
        </ul>

        <h3>4.4 Features We Process On Your Request</h3>
        
        <div class="feature-box">
          <strong>📧 Gmail Operations:</strong>
          <ul>
            <li>Send emails (to, cc, bcc, subject, body)</li>
            <li>Read emails (content, headers, metadata)</li>
            <li>Search emails</li>
            <li>Reply to emails</li>
            <li>Create drafts</li>
            <li>Delete emails</li>
            <li>Star/unstar emails</li>
            <li>Mark as read/unread</li>
          </ul>
        </div>

        <div class="feature-box">
          <strong>📅 Calendar Operations:</strong>
          <ul>
            <li>Create events (summary, start, end, description, location, attendees, reminders)</li>
            <li>Read events</li>
            <li>List events (with time/query filters)</li>
            <li>Update events</li>
            <li>Delete events</li>
          </ul>
        </div>

        <div class="feature-box">
          <strong>✅ Tasks Operations:</strong>
          <ul>
            <li>List all tasks from all lists</li>
            <li>Create new tasks (title, notes, due date)</li>
            <li>Update tasks (title, notes, date, status)</li>
            <li>Mark tasks as completed/uncompleted</li>
            <li>Delete tasks</li>
          </ul>
        </div>

        <div class="feature-box">
          <strong>👥 Contacts (Google Sheets) Operations:</strong>
          <ul>
            <li>Search contacts in Google Sheets (by name, email)</li>
            <li>List all contacts from Sheets</li>
            <li>Add new contacts (name, email, notes)</li>
            <li>Update contacts (notes)</li>
            <li>Search for "MCP1 Contacts" Sheets in Drive</li>
            <li>Create new "MCP1 Contacts" Sheets if it doesn't exist</li>
          </ul>
        </div>

        <h3>4.5 What We NEVER Collect</h3>
        <ul>
          <li>❌ Email content without your explicit request</li>
          <li>❌ Email attachments without your explicit request</li>
          <li>❌ Calendar event details without your explicit request</li>
          <li>❌ Task content without your explicit request</li>
          <li>❌ Sheets content without your explicit request</li>
          <li>❌ Files from Drive (except contact Sheets)</li>
          <li>❌ Browsing history or cookies</li>
          <li>❌ Special categories of data per GDPR Article 9</li>
        </ul>
      </div>

      <div class="section">
        <h2>5. How We Use Your Information</h2>
        <p>We use your information exclusively to provide the Service:</p>
        
        <h3>5.1 Primary Purpose</h3>
        <ul>
          <li>✅ Authenticate your requests via ChatGPT</li>
          <li>✅ Execute Gmail operations you request</li>
          <li>✅ Execute Calendar operations you request</li>
          <li>✅ Manage tasks in Google Tasks</li>
          <li>✅ Manage contacts in your Google Sheets</li>
          <li>✅ Maintain sessions and auto-refresh tokens</li>
        </ul>

        <h3>5.2 Technical Purposes</h3>
        <ul>
          <li>✅ Debug issues and improve reliability</li>
          <li>✅ Enforce rate limits (max. 100 requests/hour)</li>
          <li>✅ Security against unauthorized access</li>
        </ul>
        
        <div class="important">
          <strong>We NEVER Use Your Data For:</strong>
          <ul>
            <li>❌ Reading data without your explicit command</li>
            <li>❌ Sharing with third parties (except necessary infrastructure providers)</li>
            <li>❌ Advertising, marketing, or profiling</li>
            <li>❌ Selling or renting information</li>
            <li>❌ Training AI models</li>
          </ul>
        </div>
      </div>

      <div class="section">
        <h2>6. Data Storage and Security</h2>
        
        <h3>6.1 Encryption and Security</h3>
        <ul>
          <li><strong>Data at Rest:</strong> All OAuth tokens encrypted with <strong>AES-256-GCM</strong></li>
          <li><strong>Data in Transit:</strong> All communication uses <strong>TLS 1.3</strong></li>
          <li><strong>Key Management:</strong> Encryption keys stored separately from database</li>
          <li><strong>Access Control:</strong> Multi-layered authentication</li>
          <li><strong>Rate Limiting:</strong> Max. 100 requests/hour/user</li>
        </ul>

        <h3>6.2 Storage Location</h3>
        <ul>
          <li><strong>Database:</strong> MongoDB Atlas (USA, SOC 2, ISO 27001 certified)</li>
          <li><strong>Server:</strong> Render.com (USA, SOC 2 certified)</li>
          <li><strong>Backup:</strong> Automatic backups every 24 hours, retained 30 days</li>
        </ul>
        
        <p><strong>Important:</strong> Your actual Gmail/Calendar data never leaves Google servers. 
        We only store authentication tokens, not the actual content.</p>
      </div>

      <div class="section">
        <h2>7. International Data Transfers (GDPR Chapter V)</h2>
        <p>
          Your data is stored on servers in the USA (MongoDB Atlas, Render.com), constituting international 
          transfer outside the European Economic Area (EEA).
        </p>
        
        <h3>7.1 Legal Basis for Transfer</h3>
        <p>Transfers comply with GDPR Article 46 based on:</p>
        <ul>
          <li><strong>EU-US Data Privacy Framework (DPF):</strong> MongoDB Atlas and Render.com are certified DPF participants</li>
          <li><strong>Standard Contractual Clauses (SCCs):</strong> Additional contractual protection per EU Commission Decision</li>
          <li><strong>Technical Safeguards:</strong> End-to-end encryption and data minimization</li>
        </ul>
      </div>

      <div class="section">
        <h2>8. Data Retention Period (GDPR Article 5(1)(e))</h2>
        <table>
          <tr>
            <th>Data Type</th>
            <th>Retention Period</th>
            <th>Reason</th>
          </tr>
          <tr>
            <td>OAuth Access Token</td>
            <td>1 hour</td>
            <td>Google API security standard</td>
          </tr>
          <tr>
            <td>OAuth Refresh Token</td>
            <td>Until revoked or 180 days inactive</td>
            <td>Maintain access without re-authentication</td>
          </tr>
          <tr>
            <td>Authorization Code</td>
            <td>10 minutes</td>
            <td>OAuth flow security</td>
          </tr>
          <tr>
            <td>Proxy Token</td>
            <td>30 days</td>
            <td>ChatGPT session management</td>
          </tr>
          <tr>
            <td>API Logs</td>
            <td>90 days</td>
            <td>Debugging and security audit</td>
          </tr>
        </table>
        
        <p><strong>Automatic Cleanup:</strong> If you don't log in for 180 days, your account and all data 
        will be automatically deleted. We'll notify you via email 30 days before expiration.</p>
      </div>

      <div class="section">
        <h2>9. Your Rights Under GDPR</h2>
        
        <h3>9.1 Access and Control (GDPR Articles 15-22)</h3>
        <ul>
          <li><strong>✅ Right of Access (Article 15):</strong> Request a copy of all personal data</li>
          <li><strong>✅ Right to Rectification (Article 16):</strong> Correct inaccurate or incomplete data</li>
          <li><strong>✅ Right to Erasure (Article 17):</strong> Request immediate deletion ("right to be forgotten")</li>
          <li><strong>✅ Right to Restriction (Article 18):</strong> Temporarily suspend processing</li>
          <li><strong>✅ Right to Portability (Article 20):</strong> Receive data in structured format (JSON)</li>
          <li><strong>✅ Right to Object (Article 21):</strong> Object to processing</li>
          <li><strong>✅ Right to Withdraw Consent:</strong> Withdraw consent at any time</li>
        </ul>

        <h3>9.2 How to Exercise Your Rights</h3>
        
        <p><strong>Revoke Access:</strong></p>
        <ol>
          <li>Visit <a href="https://myaccount.google.com/permissions" target="_blank">Google Account → Security → Third-party apps</a></li>
          <li>Find "MCP1 OAuth Server"</li>
          <li>Click "Remove Access"</li>
          <li>Your tokens will be immediately invalidated</li>
        </ol>

        <p><strong>Complete Data Deletion:</strong> Contact us on GitHub with a deletion request. We'll delete within 30 days.</p>

        <h3>9.3 Right to Lodge a Complaint (GDPR Article 77)</h3>
        <div class="contact">
          <strong>Office for Personal Data Protection (ÚOOÚ)</strong><br>
          Pplk. Sochora 27<br>
          170 00 Prague 7, Czech Republic<br>
          Tel: +420 234 665 111<br>
          Email: posta@uoou.cz<br>
          Web: <a href="https://uoou.gov.cz" target="_blank">uoou.gov.cz</a>
        </div>
        
        <p><strong>Response Time:</strong> We will respond to all requests within 30 days.</p>
      </div>

      <div class="section">
        <h2>10. Automated Decision-Making (GDPR Article 22)</h2>
        <p>
          <strong>We do not use automated decision-making or profiling.</strong> All actions are performed 
          exclusively based on your explicit commands through ChatGPT.
        </p>
      </div>

      <div class="section">
        <h2>11. Google API Services User Data Policy</h2>
        <p>
          This application strictly adheres to 
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank">
            Google API Services User Data Policy
          </a>, including <strong>Limited Use</strong> requirements.
        </p>
        
        <div class="important">
          <strong>Limited Use Disclosure:</strong>
          <ul>
            <li>✅ Access data only when you explicitly request an action</li>
            <li>✅ Data used exclusively to provide the Service</li>
            <li>✅ No sharing with third parties (except Google, MongoDB, Render)</li>
            <li>✅ No advertising</li>
            <li>✅ No marketing</li>
          </ul>
        </div>
      </div>

      <div class="section">
        <h2>12. Third-Party Services (GDPR Article 28)</h2>
        <table>
          <tr>
            <th>Service</th>
            <th>Purpose</th>
            <th>Location</th>
            <th>Safeguards</th>
          </tr>
          <tr>
            <td>Google LLC</td>
            <td>OAuth, Gmail/Calendar/Tasks/Sheets/Drive API</td>
            <td>USA, EU</td>
            <td>DPF, SCCs, ISO 27001</td>
          </tr>
          <tr>
            <td>MongoDB Atlas</td>
            <td>Encrypted token storage</td>
            <td>USA</td>
            <td>DPF, SCCs, SOC 2, ISO 27001</td>
          </tr>
          <tr>
            <td>Render.com</td>
            <td>Server hosting</td>
            <td>USA</td>
            <td>DPF, SCCs, SOC 2</td>
          </tr>
          <tr>
            <td>OpenAI ChatGPT</td>
            <td>User interface</td>
            <td>USA</td>
            <td>DPF, enterprise policies</td>
          </tr>
        </table>
      </div>

      <div class="section">
        <h2>13. Children's Privacy (GDPR Article 8)</h2>
        <p>
          Our Service is not intended for users under <strong>18 years of age</strong>. We do not knowingly collect 
          information from children. If you're a parent and discover your child provided data, contact us. 
          We'll delete it within 48 hours.
        </p>
      </div>

      <div class="section">
        <h2>14. Changes to This Policy</h2>
        <p>We may update this policy. We'll inform you via:</p>
        <ul>
          <li>📧 Email notification to your Google address</li>
          <li>📅 Update of "Last Updated" date</li>
          <li>⏳ Publication at least 30 days before taking effect</li>
        </ul>
      </div>

      <div class="section">
        <h2>15. Data Breach Notification (GDPR Articles 33-34)</h2>
        <p>In case of data breach:</p>
        <ul>
          <li>We'll notify ÚOOÚ within 72 hours</li>
          <li>We'll notify affected users without undue delay</li>
          <li>We'll describe the nature of the breach</li>
          <li>We'll provide recommendations for account protection</li>
        </ul>
      </div>

      <div class="contact">
        <h2>16. Contact</h2>
        <ul>
          <li><strong>Controller:</strong> Vojtěch Brouček</li>
          <li><strong>Address:</strong> U Hvězdy 2292, Kladno, Czech Republic</li>
          <li><strong>GitHub:</strong> <a href="https://github.com/vojtechbit/mcp1" target="_blank">github.com/vojtechbit/mcp1</a></li>
          <li><strong>Response time:</strong> 30 days</li>
        </ul>
      </div>
    </div>

    <div class="footer">
      © 2025 MCP1 OAuth Server<br>
      Built with privacy and security in mind
    </div>

  </div>
</body>
</html>
  `);
});

export default router;
