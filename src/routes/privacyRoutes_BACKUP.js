import express from 'express';

const router = express.Router();

/**
 * Privacy Policy endpoint (GDPR compliant - CZ + EN)
 * GET /privacy-policy
 * 
 * Required for making Custom GPT public/shareable
 * Updated: October 12, 2025 - Complete feature coverage including Tasks, Contacts, Sheets, and Drive
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
      <h2>2. Úvod a rozsah služby</h2>
      <p>
        MCP1 Gmail & Calendar OAuth Server ("služba", "my", "naše") je OAuth proxy server, který 
        umožňuje ChatGPT Custom GPT Actions přistupovat k vašemu Google Workspace (Gmail, Kalendář, Tasks, Sheets, Drive) vaším jménem. 
        Tyto zásady vysvětlují, jak shromažďujeme, používáme, ukládáme a chráníme vaše informace v souladu s GDPR 
        (nařízení EU 2016/679) a českým zákonem č. 110/2019 Sb.
      </p>
    </div>

    <div class="section">
      <h2>3. Právní základ zpracování (GDPR Article 6)</h2>
      <p>Vaše osobní údaje zpracováváme na základě:</p>
      <ul>
        <li><strong>Souhlas (Article 6(1)(a)):</strong> Udělujete nám výslovný souhlas přes Google OAuth flow</li>
        <li><strong>Plnění smlouvy (Article 6(1)(b)):</strong> Zpracování je nezbytné pro poskytování služby</li>
        <li><strong>Oprávněný zájem (Article 6(1)(f)):</strong> Zabezpečení služby, prevence zneužití</li>
      </ul>
      <p>Souhlas můžete kdykoliv odvolat přes <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a>.</p>
    </div>

    <div class="section">
      <h2>4. Jaké informace sbíráme</h2>
      
      <h3>4.1 OAuth Autentizační údaje</h3>
      <ul>
        <li><strong>Google OAuth Access Token</strong> - Dočasný token (1 hodina)</li>
        <li><strong>Google OAuth Refresh Token</strong> - Dlouhodobý token</li>
        <li><strong>Google User ID (sub)</strong> - Váš unikátní Google identifikátor</li>
        <li><strong>E-mailová adresa</strong> - Primární e-mail Google účtu</li>
      </ul>

      <h3>4.2 Google API Scopes (oprávnění)</h3>
      <ul>
        <li><strong>https://mail.google.com/</strong> - Plný přístup k Gmail</li>
        <li><strong>https://www.googleapis.com/auth/calendar</strong> - Plný přístup ke Kalendáři</li>
        <li><strong>https://www.googleapis.com/auth/tasks</strong> - Plný přístup k Tasks</li>
        <li><strong>https://www.googleapis.com/auth/spreadsheets</strong> - Přístup k Google Sheets</li>
        <li><strong>https://www.googleapis.com/auth/drive.file</strong> - Omezený přístup k Drive</li>
        <li><strong>openid, email, profile</strong> - Základní profilové informace</li>
      </ul>

      <h3>4.3 Funkce které poskytujeme</h3>
      
      <div class="feature-box">
        <strong>📧 Gmail operace:</strong>
        <ul>
          <li>Odesílání emailů (to, cc, bcc, subject, body)</li>
          <li>Čtení emailů (obsah, hlavičky, metadata)</li>
          <li>Vyhledávání emailů</li>
          <li>Odpovídání na emaily</li>
          <li>Vytváření konceptů</li>
          <li>Mazání emailů</li>
          <li>Označování hvězdičkou</li>
          <li>Označování jako přečtené/nepřečtené</li>
        </ul>
      </div>

      <div class="feature-box">
        <strong>📅 Kalendář operace:</strong>
        <ul>
          <li>Vytváření událostí (summary, start, end, description, location, attendees, reminders)</li>
          <li>Čtení událostí</li>
          <li>Výpis událostí s filtry</li>
          <li>Aktualizace událostí</li>
          <li>Mazání událostí</li>
        </ul>
      </div>

      <div class="feature-box">
        <strong>✅ Google Tasks operace:</strong>
        <ul>
          <li>Výpis všech úkolů</li>
          <li>Vytváření nových úkolů (title, notes, due date)</li>
          <li>Aktualizace úkolů (title, notes, date, status)</li>
          <li>Označování jako dokončených</li>
          <li>Mazání úkolů</li>
        </ul>
      </div>

      <div class="feature-box">
        <strong>👥 Kontakty (Google Sheets):</strong>
        <ul>
          <li>Vyhledávání kontaktů v Google Sheets "MCP1 Contacts"</li>
          <li>Výpis všech kontaktů</li>
          <li>Přidávání nových kontaktů (jméno, email, poznámky)</li>
          <li>Aktualizace kontaktů</li>
          <li>Vyhledávání Sheets v Drive</li>
          <li>Vytváření nového Sheets pokud neexistuje</li>
        </ul>
      </div>

      <h3>4.4 Co NIKDY nesbíráme</h3>
      <ul>
        <li>❌ Obsah emailů bez vašeho požadavku</li>
        <li>❌ Přílohy emailů</li>
        <li>❌ Obsah kalendářových událostí bez požadavku</li>
        <li>❌ Citlivé údaje podle GDPR Article 9</li>
      </ul>
    </div>

    <div class="section">
      <h2>5. Jak používáme vaše informace</h2>
      <p>Vaše informace používáme výhradně k poskytování služby:</p>
      <ul>
        <li>✅ Autentizace požadavků přes ChatGPT</li>
        <li>✅ Provádění Gmail/Calendar/Tasks/Contacts operací na váš požadavek</li>
        <li>✅ Udržování session a obnovování tokenů</li>
        <li>✅ Debugging a zlepšování služby</li>
        <li>✅ Rate limiting pro prevenci zneužití</li>
      </ul>
      
      <div class="important">
        <strong>NIKDY NEpoužíváme data pro:</strong>
        <ul>
          <li>❌ Čtení dat bez vašeho příkazu</li>
          <li>❌ Sdílení s třetími stranami</li>
          <li>❌ Reklamu nebo marketing</li>
          <li>❌ Prodej informací</li>
          <li>❌ Trénování AI modelů</li>
        </ul>
      </div>
    </div>

    <div class="section">
      <h2>6. Ukládání a zabezpečení</h2>
      <h3>6.1 Šifrování</h3>
      <ul>
        <li>OAuth tokeny: <strong>AES-256-GCM</strong></li>
        <li>Přenos dat: <strong>TLS 1.3</strong></li>
        <li>Šifrovací klíče uloženy odděleně</li>
      </ul>

      <h3>6.2 Místo uložení</h3>
      <ul>
        <li>MongoDB Atlas (USA, SOC 2, ISO 27001)</li>
        <li>Render.com (USA, SOC 2)</li>
      </ul>
    </div>

    <div class="section">
      <h2>7. Mezinárodní přenosy dat</h2>
      <p>Data jsou ukládána v USA. Používáme:</p>
      <ul>
        <li>EU-US Data Privacy Framework (DPF)</li>
        <li>Standard Contractual Clauses (SCCs)</li>
        <li>Technické záruky (šifrování)</li>
      </ul>
    </div>

    <div class="section">
      <h2>8. Doba uchovávání</h2>
      <table>
        <tr>
          <th>Typ dat</th>
          <th>Doba</th>
        </tr>
        <tr>
          <td>Access Token</td>
          <td>1 hodina</td>
        </tr>
        <tr>
          <td>Refresh Token</td>
          <td>Do zrušení nebo 180 dní neaktivity</td>
        </tr>
        <tr>
          <td>Authorization Code</td>
          <td>10 minut</td>
        </tr>
        <tr>
          <td>Proxy Token</td>
          <td>30 dní</td>
        </tr>
        <tr>
          <td>API Logy</td>
          <td>90 dní</td>
        </tr>
      </table>
    </div>

    <div class="section">
      <h2>9. Vaše práva podle GDPR</h2>
      <ul>
        <li>✅ Právo na přístup (Article 15)</li>
        <li>✅ Právo na opravu (Article 16)</li>
        <li>✅ Právo na výmaz (Article 17)</li>
        <li>✅ Právo na omezení (Article 18)</li>
        <li>✅ Právo na přenositelnost (Article 20)</li>
        <li>✅ Právo vznést námitku (Article 21)</li>
        <li>✅ Právo odvolat souhlas</li>
      </ul>

      <h3>9.1 Jak zrušit přístup</h3>
      <ol>
        <li>Navštivte <a href="https://myaccount.google.com/permissions" target="_blank">Google Account → Zabezpečení → Aplikace třetích stran</a></li>
        <li>Najděte "MCP1 OAuth Server"</li>
        <li>Klikněte "Odebrat přístup"</li>
      </ol>

      <h3>9.2 Právo podat stížnost</h3>
      <div class="contact">
        <strong>Úřad pro ochranu osobních údajů (ÚOOÚ)</strong><br>
        Pplk. Sochora 27<br>
        170 00 Praha 7<br>
        Tel: +420 234 665 111<br>
        E-mail: posta@uoou.cz<br>
        Web: <a href="https://uoou.gov.cz" target="_blank">uoou.gov.cz</a>
      </div>
    </div>

    <div class="section">
      <h2>10. Google API Services User Data Policy</h2>
      <p>
        Dodržujeme <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank">
          Google API Services User Data Policy
        </a> včetně Limited Use požadavků.
      </p>
      <div class="important">
        <strong>Limited Use:</strong>
        <ul>
          <li>✅ Přístup pouze na váš požadavek</li>
          <li>✅ Data pouze pro poskytování služby</li>
          <li>✅ Bez sdílení s třetími stranami</li>
          <li>✅ Bez reklam</li>
        </ul>
      </div>
    </div>

    <div class="section">
      <h2>11. Služby třetích stran</h2>
      <table>
        <tr>
          <th>Služba</th>
          <th>Účel</th>
        </tr>
        <tr>
          <td>Google LLC</td>
          <td>OAuth, Gmail/Calendar/Tasks/Sheets/Drive API</td>
        </tr>
        <tr>
          <td>MongoDB Atlas</td>
          <td>Šifrované uložení tokenů</td>
        </tr>
        <tr>
          <td>Render.com</td>
          <td>Hosting serveru</td>
        </tr>
        <tr>
          <td>OpenAI ChatGPT</td>
          <td>Uživatelské rozhraní</td>
        </tr>
      </table>
    </div>

    <div class="section">
      <h2>12. Ochrana dětí</h2>
      <p>
        Služba není určena pro uživatele mladší 18 let. Pokud zjistíme, že dítě poskytlo údaje, 
        smažeme je do 48 hodin.
      </p>
    </div>

    <div class="section">
      <h2>13. Oznámení o narušení zabezpečení</h2>
      <p>V případě data breach:</p>
      <ul>
        <li>Oznámíme ÚOOÚ do 72 hodin</li>
        <li>Oznámíme dotčeným uživatelům bezodkladně</li>
        <li>Poskytneme doporučení pro ochranu účtu</li>
      </ul>
    </div>

    <div class="contact">
      <h2>14. Kontakt</h2>
      <ul>
        <li><strong>Správce:</strong> Vojtěch Brouček</li>
        <li><strong>GitHub:</strong> <a href="https://github.com/vojtechbit/mcp1" target="_blank">github.com/vojtechbit/mcp1</a></li>
        <li><strong>Doba odpovědi:</strong> 30 dní</li>
      </ul>
    </div>

    <!-- ENGLISH VERSION -->
    
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
      </div>

      <div class="section">
        <h2>2. Service Overview</h2>
        <p>
          MCP1 is an OAuth proxy server enabling ChatGPT Custom GPT Actions to interact with your Google Workspace 
          (Gmail, Calendar, Tasks, Sheets, Drive) on your behalf, in compliance with GDPR and Czech law.
        </p>
      </div>

      <div class="section">
        <h2>3. Legal Basis (GDPR Article 6)</h2>
        <ul>
          <li><strong>Consent (6(1)(a)):</strong> You provide consent via Google OAuth</li>
          <li><strong>Contract (6(1)(b)):</strong> Necessary to provide the service</li>
          <li><strong>Legitimate Interest (6(1)(f)):</strong> Security and abuse prevention</li>
        </ul>
      </div>

      <div class="section">
        <h2>4. Data We Collect</h2>
        
        <h3>4.1 OAuth Data</h3>
        <ul>
          <li>Access Tokens (1 hour validity)</li>
          <li>Refresh Tokens (long-lived)</li>
          <li>Google User ID</li>
          <li>Email Address</li>
        </ul>

        <h3>4.2 API Scopes</h3>
        <ul>
          <li>Gmail - Full access</li>
          <li>Calendar - Full access</li>
          <li>Tasks - Full access</li>
          <li>Sheets - Read/Write access</li>
          <li>Drive - Limited (for contact Sheets only)</li>
        </ul>

        <h3>4.3 Features</h3>
        <div class="feature-box">
          <strong>📧 Gmail:</strong> Send, read, search, reply, draft, delete, star, mark emails
        </div>
        <div class="feature-box">
          <strong>📅 Calendar:</strong> Create, read, list, update, delete events
        </div>
        <div class="feature-box">
          <strong>✅ Tasks:</strong> List, create, update, complete, delete tasks
        </div>
        <div class="feature-box">
          <strong>👥 Contacts:</strong> Search, list, add, update contacts in Google Sheets
        </div>
      </div>

      <div class="section">
        <h2>5. How We Use Data</h2>
        <p>We use data only to:</p>
        <ul>
          <li>✅ Authenticate your requests</li>
          <li>✅ Execute operations you request</li>
          <li>✅ Maintain sessions</li>
          <li>✅ Debug issues</li>
        </ul>
        
        <div class="important">
          <strong>We NEVER:</strong>
          <ul>
            <li>❌ Read data without your command</li>
            <li>❌ Share with third parties</li>
            <li>❌ Use for advertising</li>
            <li>❌ Sell information</li>
          </ul>
        </div>
      </div>

      <div class="section">
        <h2>6. Security</h2>
        <ul>
          <li>AES-256-GCM encryption</li>
          <li>TLS 1.3 for data in transit</li>
          <li>MongoDB Atlas (USA, SOC 2, ISO 27001)</li>
          <li>Render.com hosting (USA, SOC 2)</li>
        </ul>
      </div>

      <div class="section">
        <h2>7. Data Retention</h2>
        <table>
          <tr>
            <th>Data Type</th>
            <th>Period</th>
          </tr>
          <tr>
            <td>Access Token</td>
            <td>1 hour</td>
          </tr>
          <tr>
            <td>Refresh Token</td>
            <td>Until revoked or 180 days inactive</td>
          </tr>
          <tr>
            <td>Logs</td>
            <td>90 days</td>
          </tr>
        </table>
      </div>

      <div class="section">
        <h2>8. Your Rights (GDPR)</h2>
        <ul>
          <li>✅ Access (Article 15)</li>
          <li>✅ Rectification (Article 16)</li>
          <li>✅ Erasure (Article 17)</li>
          <li>✅ Restriction (Article 18)</li>
          <li>✅ Portability (Article 20)</li>
          <li>✅ Object (Article 21)</li>
        </ul>

        <p><strong>Revoke Access:</strong> Visit <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a></p>
      </div>

      <div class="section">
        <h2>9. Google API Policy</h2>
        <p>We comply with <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank">Google API Services User Data Policy</a> Limited Use requirements.</p>
      </div>

      <div class="section">
        <h2>10. Third-Party Services</h2>
        <ul>
          <li>Google LLC - OAuth, APIs</li>
          <li>MongoDB Atlas - Encrypted storage</li>
          <li>Render.com - Server hosting</li>
          <li>OpenAI ChatGPT - User interface</li>
        </ul>
      </div>

      <div class="contact">
        <h2>11. Contact</h2>
        <p><strong>Controller:</strong> Vojtěch Brouček</p>
        <p><strong>GitHub:</strong> <a href="https://github.com/vojtechbit/mcp1" target="_blank">github.com/vojtechbit/mcp1</a></p>
        <p><strong>Response time:</strong> 30 days</p>
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
