import express from 'express';

const router = express.Router();

/**
 * Privacy Policy endpoint (GDPR compliant - CZ + EN)
 * GET /privacy-policy
 * 
 * Required for making Custom GPT public/shareable
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
  </style>
</head>
<body>
  <div class="container">
    
    <!-- ============================================ -->
    <!-- ČESKÁ VERZE (PRIMARY) -->
    <!-- ============================================ -->
    
    <h1>🔐 Zásady ochrany osobních údajů</h1>
    <p class="last-updated">Poslední aktualizace: 11. října 2025</p>

    <div class="highlight">
      <strong>Stručně:</strong> Přistupujeme k vašim datům Gmail a Google Kalendář pouze když to explicitně požadujete. 
      Všechny tokeny šifrujeme. Vaše data nikdy neprodáváme ani nepoužíváme pro jiné účely než poskytování služby. 
      Přístup můžete kdykoliv zrušit.
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
        umožňuje ChatGPT Custom GPT Actions přistupovat k vašemu Gmail a Google Kalendář účtu vaším jménem. 
        Tyto zásady vysvětlují, jak shromažďujeme, používáme, ukládáme a chráníme vaše informace.
      </p>
    </div>

    <div class="section">
      <h2>3. Právní základ zpracování (GDPR Article 6)</h2>
      <p>Vaše osobní údaje zpracováváme na základě:</p>
      <ul>
        <li><strong>Souhlas (Article 6(1)(a)):</strong> Udělujete nám souhlas přes Google OAuth flow</li>
        <li><strong>Plnění smlouvy (Article 6(1)(b)):</strong> Zpracování je nutné pro poskytování služby</li>
        <li><strong>Oprávněný zájem (Article 6(1)(f)):</strong> Zabezpečení služby, prevence zneužití</li>
      </ul>
      <p>Můžete kdykoli odvolat svůj souhlas prostřednictvím <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a>.</p>
    </div>

    <div class="section">
      <h2>4. Jaké informace sbíráme</h2>
      
      <h3>4.1 OAuth Tokeny</h3>
      <p>Při autentizaci s Google shromažďujeme a ukládáme:</p>
      <ul>
        <li><strong>Google OAuth Access Token</strong> - Dočasný token pro přístup k Gmail a Kalendáři</li>
        <li><strong>Google OAuth Refresh Token</strong> - Dlouhodobý token pro udržení přístupu</li>
        <li><strong>Google User ID (sub)</strong> - Váš unikátní identifikátor Google účtu</li>
        <li><strong>E-mailová adresa</strong> - Adresa vašeho Google účtu</li>
      </ul>

      <h3>4.2 Provozní data</h3>
      <p>Automaticky sbíráme:</p>
      <ul>
        <li>Logy API požadavků (časové razítko, endpoint, ID uživatele)</li>
        <li>Časová razítka použití a obnovení tokenů</li>
        <li>Error logy pro debugging a zlepšování služby</li>
      </ul>

      <h3>4.3 Co NESBÍRÁME</h3>
      <ul>
        <li>❌ Obsah emailů (přistupujeme pouze na váš požadavek)</li>
        <li>❌ Detaily kalendářových událostí (přistupujeme pouze na váš požadavek)</li>
        <li>❌ Seznam kontaktů</li>
        <li>❌ Soubory nebo přílohy (pokud to explicitně nepožadujete)</li>
        <li>❌ Historii prohlížení nebo cookies</li>
      </ul>
    </div>

    <div class="section">
      <h2>5. Jak používáme vaše informace</h2>
      <p>Vaše informace používáme výhradně k poskytování služby:</p>
      <ul>
        <li>✅ Autentizace vašich požadavků přes ChatGPT</li>
        <li>✅ Provádění Gmail a Kalendář akcí, které explicitně požadujete</li>
        <li>✅ Udržování vaší session a automatické obnovování tokenů</li>
        <li>✅ Debugging problémů a zlepšování spolehlivosti služby</li>
        <li>✅ Vynucování rate limitů pro prevenci zneužití</li>
      </ul>
      
      <div class="important">
        <strong>Důležité:</strong> NIKDY:
        <ul>
          <li>❌ Nečteme vaše emaily, pokud to explicitně nepožadujete</li>
          <li>❌ Neposíláme emaily vaším jménem bez vašeho explicitního příkazu</li>
          <li>❌ Nesdílíme vaše data s třetími stranami</li>
          <li>❌ Nepoužíváme vaše data pro reklamu nebo marketing</li>
          <li>❌ Neprodáváme ani nepronajímáme vaše informace</li>
        </ul>
      </div>
    </div>

    <div class="section">
      <h2>6. Ukládání a zabezpečení dat</h2>
      
      <h3>6.1 Šifrování</h3>
      <ul>
        <li>Všechny OAuth tokeny jsou šifrovány pomocí <strong>AES-256-GCM</strong></li>
        <li>Šifrovací klíče jsou uloženy odděleně od databáze</li>
        <li>Data při přenosu používají <strong>TLS 1.3</strong></li>
      </ul>

      <h3>6.2 Místo uložení</h3>
      <ul>
        <li>Šifrované tokeny: MongoDB Atlas (cloudová databáze, USA)</li>
        <li>Server: Render.com (cloudový hosting, USA)</li>
      </ul>

      <h3>6.3 Kontrola přístupu</h3>
      <ul>
        <li>Pouze autentizovaní uživatelé mají přístup ke svým vlastním datům</li>
        <li>Žádný manuální přístup administrátorů k šifrovaným tokenům</li>
        <li>API rate limiting pro prevenci zneužití</li>
      </ul>
    </div>

    <div class="section">
      <h2>7. Mezinárodní přenosy dat</h2>
      <p>
        Vaše data jsou uložena na serverech v USA (MongoDB Atlas, Render.com). 
        Tyto služby dodržují <strong>EU-US Data Privacy Framework</strong> a další ochranné mechanismy 
        pro mezinárodní transfery podle GDPR Article 46.
      </p>
    </div>

    <div class="section">
      <h2>8. Doba uchovávání dat</h2>
      <p>Vaše data uchováváme následovně:</p>
      <ul>
        <li><strong>OAuth Tokeny:</strong> Dokud nezrušíte přístup nebo nesmažete účet</li>
        <li><strong>Authorization Codes:</strong> 10 minut (automaticky smazány)</li>
        <li><strong>Proxy Tokeny:</strong> 30 dní (automaticky vymazány po expiraci)</li>
        <li><strong>API Logy:</strong> 90 dní pro účely debuggingu</li>
      </ul>
    </div>

    <div class="section">
      <h2>9. Vaše práva podle GDPR</h2>
      
      <h3>9.1 Přístup a kontrola</h3>
      <p>Máte právo:</p>
      <ul>
        <li>✅ <strong>Přístup (Article 15):</strong> Vyžádat kopii svých osobních údajů</li>
        <li>✅ <strong>Oprava (Article 16):</strong> Opravit nesprávné nebo neúplné údaje</li>
        <li>✅ <strong>Výmaz (Article 17):</strong> Požádat o smazání svých dat ("právo být zapomenut")</li>
        <li>✅ <strong>Omezení (Article 18):</strong> Omezit zpracování vašich údajů</li>
        <li>✅ <strong>Přenositelnost (Article 20):</strong> Získat data ve strukturovaném formátu</li>
        <li>✅ <strong>Námitka (Article 21):</strong> Vznést námitku proti zpracování</li>
        <li>✅ <strong>Odvolání souhlasu:</strong> Kdykoliv odvolat souhlas se zpracováním</li>
      </ul>

      <h3>9.2 Jak zrušit přístup</h3>
      <ol>
        <li>Navštivte <a href="https://myaccount.google.com/permissions" target="_blank">Google Account → Zabezpečení → Aplikace třetích stran</a></li>
        <li>Najděte "MCP1 OAuth Server"</li>
        <li>Klikněte na "Odebrat přístup"</li>
      </ol>
      <p>Vaše tokeny budou okamžitě zneplatněny na straně Google.</p>

      <h3>9.3 Právo podat stížnost</h3>
      <p>
        Máte právo podat stížnost u dozorového orgánu:
      </p>
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
      <h2>10. Automatizované rozhodování</h2>
      <p>
        Nepoužíváme automatizované rozhodování ani profilování ve smyslu GDPR Article 22. 
        Všechny akce jsou prováděny na základě vašich explicitních příkazů.
      </p>
    </div>

    <div class="section">
      <h2>11. Google API Services User Data Policy</h2>
      <p>
        Použití a přenos informací získaných z Google APIs touto aplikací dodržuje 
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank">
          Google API Services User Data Policy
        </a>, včetně požadavků Limited Use.
      </p>
      <p><strong>Limited Use prohlášení:</strong></p>
      <ul>
        <li>Přistupujeme k Gmail a Kalendář datům pouze když explicitně požadujete akci</li>
        <li>Data nejsou používána pro jiný účel než poskytování služby</li>
        <li>Data nejsou sdílena s třetími stranami kromě nezbytného pro poskytování služby</li>
        <li>Data nejsou používána pro reklamu nebo marketing</li>
      </ul>
    </div>

    <div class="section">
      <h2>12. Služby třetích stran</h2>
      <p>Používáme následující služby třetích stran:</p>
      <ul>
        <li><strong>Google OAuth 2.0:</strong> Pro autentizaci</li>
        <li><strong>Google Gmail API:</strong> Pro operace s emaily</li>
        <li><strong>Google Calendar API:</strong> Pro operace s kalendářem</li>
        <li><strong>MongoDB Atlas:</strong> Pro šifrované uložení dat (USA)</li>
        <li><strong>Render.com:</strong> Pro hosting serveru (USA)</li>
        <li><strong>OpenAI ChatGPT:</strong> Pro uživatelské rozhraní (vy iniciujete akce přes ChatGPT)</li>
      </ul>
    </div>

    <div class="section">
      <h2>13. Ochrana dětí</h2>
      <p>
        Naše služba není určena pro uživatele mladší 18 let. Vědomě neshromažďujeme 
        informace od dětí. Pokud jste rodič nebo opatrovník a věříte, že vaše dítě 
        nám poskytlo osobní údaje, kontaktujte nás.
      </p>
    </div>

    <div class="section">
      <h2>14. Změny těchto zásad</h2>
      <p>
        Tyto zásady můžeme čas od času aktualizovat. O změnách vás budeme informovat 
        aktualizací data "Poslední aktualizace" v horní části těchto zásad. Pokračování 
        v používání služby po změnách představuje přijetí aktualizovaných zásad.
      </p>
    </div>

    <div class="section">
      <h2>15. Oznámení o narušení zabezpečení</h2>
      <p>
        V nepravděpodobném případě narušení zabezpečení, které ovlivní vaše osobní údaje:
      </p>
      <ul>
        <li>Oznámíme to dotčeným uživatelům do 72 hodin</li>
        <li>Popíšeme povahu narušení</li>
        <li>Vysvětlíme kroky k zmírnění narušení</li>
        <li>Poskytneme doporučení pro ochranu vašeho účtu</li>
      </ul>
    </div>

    <div class="contact">
      <h2>16. Kontaktujte nás</h2>
      <p>Máte-li jakékoli otázky ohledně těchto zásad nebo našich praktik zpracování dat:</p>
      <ul>
        <li><strong>Správce:</strong> Vojtěch Brouček</li>
        <li><strong>Adresa:</strong> U Hvězdy 2292, Kladno</li>
        <li><strong>GitHub:</strong> <a href="https://github.com/vojtechbit/mcp1" target="_blank">github.com/vojtechbit/mcp1</a></li>
        <li><strong>URL služby:</strong> <a href="https://mcp1-oauth-server.onrender.com">mcp1-oauth-server.onrender.com</a></li>
      </ul>
    </div>

    <!-- ============================================ -->
    <!-- ENGLISH VERSION -->
    <!-- ============================================ -->

    <div class="lang-divider">
      <h1>🔐 Privacy Policy</h1>
      <p class="last-updated">Last Updated: October 11, 2025</p>

      <div class="highlight">
        <strong>TL;DR:</strong> We only access your Gmail and Calendar data when you explicitly request it. 
        We encrypt and securely store OAuth tokens. We never sell your data or use it for any purpose other than 
        providing the service. You can revoke access anytime.
      </div>

      <div class="section">
        <h2>1. Data Controller</h2>
        <p><strong>Controller:</strong> Vojtěch Brouček</p>
        <p><strong>Address:</strong> U Hvězdy 2292, Kladno, Czech Republic</p>
        <p><strong>Contact:</strong> GitHub: <a href="https://github.com/vojtechbit/mcp1" target="_blank">github.com/vojtechbit/mcp1</a></p>
        <p><strong>Service URL:</strong> <a href="https://mcp1-oauth-server.onrender.com">mcp1-oauth-server.onrender.com</a></p>
      </div>

      <div class="section">
        <h2>2. Introduction</h2>
        <p>
          MCP1 Gmail & Calendar OAuth Server ("we", "our", "the Service") is an OAuth proxy server that 
          enables ChatGPT Custom GPT Actions to interact with your Gmail and Google Calendar accounts 
          on your behalf. This Privacy Policy explains how we collect, use, store, and protect your information.
        </p>
      </div>

      <div class="section">
        <h2>3. Legal Basis for Processing (GDPR Article 6)</h2>
        <p>We process your personal data based on:</p>
        <ul>
          <li><strong>Consent (Article 6(1)(a)):</strong> You provide consent through Google OAuth flow</li>
          <li><strong>Contract (Article 6(1)(b)):</strong> Processing is necessary to provide the service</li>
          <li><strong>Legitimate Interest (Article 6(1)(f)):</strong> Service security, abuse prevention</li>
        </ul>
        <p>You can withdraw your consent at any time via <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a>.</p>
      </div>

      <div class="section">
        <h2>4. Information We Collect</h2>
        
        <h3>4.1 OAuth Tokens</h3>
        <p>When you authenticate with Google, we collect and store:</p>
        <ul>
          <li><strong>Google OAuth Access Tokens</strong> - Temporary tokens to access your Gmail and Calendar</li>
          <li><strong>Google OAuth Refresh Tokens</strong> - Long-lived tokens to maintain access</li>
          <li><strong>Google User ID (sub)</strong> - Your unique Google account identifier</li>
          <li><strong>Email Address</strong> - Your Google account email address</li>
        </ul>

        <h3>4.2 Usage Data</h3>
        <p>We automatically collect:</p>
        <ul>
          <li>API request logs (timestamp, endpoint, user ID)</li>
          <li>Token usage and refresh timestamps</li>
          <li>Error logs for debugging and service improvement</li>
        </ul>

        <h3>4.3 What We DO NOT Collect</h3>
        <ul>
          <li>❌ Email content (we only access when you explicitly request an action)</li>
          <li>❌ Calendar event details (we only access when you explicitly request an action)</li>
          <li>❌ Contact lists</li>
          <li>❌ Files or attachments (unless explicitly requested by you)</li>
          <li>❌ Browsing history or cookies</li>
        </ul>
      </div>

      <div class="section">
        <h2>5. How We Use Your Information</h2>
        <p>We use your information solely to provide the Service:</p>
        <ul>
          <li>✅ Authenticate your requests via ChatGPT</li>
          <li>✅ Execute Gmail and Calendar actions you explicitly request</li>
          <li>✅ Maintain your session and automatically refresh tokens</li>
          <li>✅ Debug issues and improve service reliability</li>
          <li>✅ Enforce rate limits to prevent abuse</li>
        </ul>
        
        <div class="important">
          <strong>Important:</strong> We NEVER:
          <ul>
            <li>❌ Read your emails unless you explicitly request it</li>
            <li>❌ Send emails on your behalf without your explicit command</li>
            <li>❌ Share your data with third parties</li>
            <li>❌ Use your data for advertising or marketing</li>
            <li>❌ Sell or rent your information</li>
          </ul>
        </div>
      </div>

      <div class="section">
        <h2>6. Data Storage and Security</h2>
        
        <h3>6.1 Encryption</h3>
        <ul>
          <li>All OAuth tokens are encrypted using <strong>AES-256-GCM encryption</strong></li>
          <li>Encryption keys are stored separately from the database</li>
          <li>Data in transit uses <strong>TLS 1.3</strong></li>
        </ul>

        <h3>6.2 Storage Location</h3>
        <ul>
          <li>Encrypted tokens: MongoDB Atlas (cloud database, USA)</li>
          <li>Server: Render.com (cloud hosting, USA)</li>
        </ul>

        <h3>6.3 Access Control</h3>
        <ul>
          <li>Only authenticated users can access their own data</li>
          <li>No manual access to encrypted tokens by administrators</li>
          <li>API rate limiting to prevent abuse</li>
        </ul>
      </div>

      <div class="section">
        <h2>7. International Data Transfers</h2>
        <p>
          Your data is stored on servers in the USA (MongoDB Atlas, Render.com). 
          These services comply with <strong>EU-US Data Privacy Framework</strong> and other safeguards 
          for international transfers under GDPR Article 46.
        </p>
      </div>

      <div class="section">
        <h2>8. Data Retention</h2>
        <p>We retain your data as follows:</p>
        <ul>
          <li><strong>OAuth Tokens:</strong> Until you revoke access or delete your account</li>
          <li><strong>Authorization Codes:</strong> 10 minutes (automatically deleted)</li>
          <li><strong>Proxy Tokens:</strong> 30 days (automatically cleaned up if expired)</li>
          <li><strong>API Logs:</strong> 90 days for debugging purposes</li>
        </ul>
      </div>

      <div class="section">
        <h2>9. Your Rights Under GDPR</h2>
        
        <h3>9.1 Access and Control</h3>
        <p>You have the right to:</p>
        <ul>
          <li>✅ <strong>Access (Article 15):</strong> Request a copy of your personal data</li>
          <li>✅ <strong>Rectification (Article 16):</strong> Correct inaccurate or incomplete data</li>
          <li>✅ <strong>Erasure (Article 17):</strong> Request deletion of your data ("right to be forgotten")</li>
          <li>✅ <strong>Restriction (Article 18):</strong> Restrict processing of your data</li>
          <li>✅ <strong>Portability (Article 20):</strong> Receive data in a structured format</li>
          <li>✅ <strong>Object (Article 21):</strong> Object to processing</li>
          <li>✅ <strong>Withdraw Consent:</strong> Withdraw consent at any time</li>
        </ul>

        <h3>9.2 How to Revoke Access</h3>
        <ol>
          <li>Visit <a href="https://myaccount.google.com/permissions" target="_blank">Google Account → Security → Third-party apps</a></li>
          <li>Find "MCP1 OAuth Server"</li>
          <li>Click "Remove Access"</li>
        </ol>
        <p>Your tokens will be immediately invalidated on Google's side.</p>

        <h3>9.3 Right to Lodge a Complaint</h3>
        <p>
          You have the right to lodge a complaint with the supervisory authority:
        </p>
        <div class="contact">
          <strong>Office for Personal Data Protection (ÚOOÚ)</strong><br>
          Pplk. Sochora 27<br>
          170 00 Prague 7, Czech Republic<br>
          Tel: +420 234 665 111<br>
          Email: posta@uoou.cz<br>
          Web: <a href="https://uoou.gov.cz" target="_blank">uoou.gov.cz</a>
        </div>
      </div>

      <div class="section">
        <h2>10. Automated Decision-Making</h2>
        <p>
          We do not use automated decision-making or profiling under GDPR Article 22. 
          All actions are performed based on your explicit commands.
        </p>
      </div>

      <div class="section">
        <h2>11. Google API Services User Data Policy</h2>
        <p>
          This application's use and transfer of information received from Google APIs adheres to 
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank">
            Google API Services User Data Policy
          </a>, including the Limited Use requirements.
        </p>
        <p><strong>Limited Use Disclosure:</strong></p>
        <ul>
          <li>We only access Gmail and Calendar data when you explicitly request an action</li>
          <li>Data is not used for any purpose other than providing the Service</li>
          <li>Data is not shared with third parties except as necessary to provide the Service</li>
          <li>Data is not used for advertising or marketing</li>
        </ul>
      </div>

      <div class="section">
        <h2>12. Third-Party Services</h2>
        <p>We use the following third-party services:</p>
        <ul>
          <li><strong>Google OAuth 2.0:</strong> For authentication</li>
          <li><strong>Google Gmail API:</strong> For email operations</li>
          <li><strong>Google Calendar API:</strong> For calendar operations</li>
          <li><strong>MongoDB Atlas:</strong> For encrypted data storage (USA)</li>
          <li><strong>Render.com:</strong> For server hosting (USA)</li>
          <li><strong>OpenAI ChatGPT:</strong> For user interface (you initiate actions through ChatGPT)</li>
        </ul>
      </div>

      <div class="section">
        <h2>13. Children's Privacy</h2>
        <p>
          Our Service is not intended for users under 18 years of age. We do not knowingly collect 
          information from children. If you are a parent or guardian and believe your child has 
          provided us with personal information, please contact us.
        </p>
      </div>

      <div class="section">
        <h2>14. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any changes by 
          updating the "Last Updated" date at the top of this policy. Continued use of the Service 
          after changes constitutes acceptance of the updated policy.
        </p>
      </div>

      <div class="section">
        <h2>15. Data Breach Notification</h2>
        <p>
          In the unlikely event of a data breach that affects your personal information:
        </p>
        <ul>
          <li>We will notify affected users within 72 hours</li>
          <li>We will describe the nature of the breach</li>
          <li>We will explain steps taken to mitigate the breach</li>
          <li>We will provide recommendations for protecting your account</li>
        </ul>
      </div>

      <div class="contact">
        <h2>16. Contact Us</h2>
        <p>If you have any questions about this Privacy Policy or our data practices:</p>
        <ul>
          <li><strong>Controller:</strong> Vojtěch Brouček</li>
          <li><strong>Address:</strong> U Hvězdy 2292, Kladno, Czech Republic</li>
          <li><strong>GitHub:</strong> <a href="https://github.com/vojtechbit/mcp1" target="_blank">github.com/vojtechbit/mcp1</a></li>
          <li><strong>Service URL:</strong> <a href="https://mcp1-oauth-server.onrender.com">mcp1-oauth-server.onrender.com</a></li>
        </ul>
      </div>

    </div>

    <div class="footer">
      © 2025 MCP1 OAuth Server. Postaveno s důrazem na soukromí a bezpečnost.<br>
      Built with privacy and security in mind.
    </div>

  </div>
</body>
</html>
  `);
});

export default router;
