import express from 'express';

const router = express.Router();

/**
 * Privacy Policy endpoint
 * GET /privacy-policy
 * 
 * Required for making Custom GPT public/shareable
 */
router.get('/privacy-policy', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - MCP1 Gmail & Calendar OAuth Server</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
    }
    h2 {
      color: #34495e;
      margin-top: 30px;
    }
    .last-updated {
      color: #7f8c8d;
      font-style: italic;
      margin-bottom: 30px;
    }
    .section {
      margin-bottom: 25px;
    }
    ul {
      margin-left: 20px;
    }
    .highlight {
      background-color: #fff3cd;
      padding: 15px;
      border-left: 4px solid #ffc107;
      margin: 20px 0;
    }
    .contact {
      background-color: #e8f4f8;
      padding: 15px;
      border-radius: 5px;
      margin-top: 30px;
    }
  </style>
</head>
<body>
  <h1>🔐 Privacy Policy</h1>
  <p class="last-updated">Last Updated: October 11, 2025</p>

  <div class="highlight">
    <strong>TL;DR:</strong> We only access your Gmail and Calendar data to perform actions you explicitly request. 
    We encrypt and securely store OAuth tokens. We never sell your data or use it for any purpose other than 
    providing the service. You can revoke access anytime.
  </div>

  <div class="section">
    <h2>1. Introduction</h2>
    <p>
      MCP1 Gmail & Calendar OAuth Server ("we", "our", "the Service") is an OAuth proxy server that 
      enables ChatGPT Custom GPT Actions to interact with your Gmail and Google Calendar accounts 
      on your behalf. This Privacy Policy explains how we collect, use, store, and protect your information.
    </p>
  </div>

  <div class="section">
    <h2>2. Information We Collect</h2>
    
    <h3>2.1 OAuth Tokens</h3>
    <p>When you authenticate with Google, we collect and store:</p>
    <ul>
      <li><strong>Google OAuth Access Tokens</strong> - Temporary tokens to access your Gmail and Calendar</li>
      <li><strong>Google OAuth Refresh Tokens</strong> - Long-lived tokens to maintain access</li>
      <li><strong>Google User ID (sub)</strong> - Your unique Google account identifier</li>
      <li><strong>Email Address</strong> - Your Google account email address</li>
    </ul>

    <h3>2.2 Usage Data</h3>
    <p>We automatically collect:</p>
    <ul>
      <li>API request logs (timestamp, endpoint, user ID)</li>
      <li>Token usage and refresh timestamps</li>
      <li>Error logs for debugging and service improvement</li>
    </ul>

    <h3>2.3 What We DO NOT Collect</h3>
    <ul>
      <li>❌ Email content (we only access when you explicitly request an action)</li>
      <li>❌ Calendar event details (we only access when you explicitly request an action)</li>
      <li>❌ Contact lists</li>
      <li>❌ Files or attachments (unless explicitly requested by you)</li>
      <li>❌ Browsing history or cookies</li>
    </ul>
  </div>

  <div class="section">
    <h2>3. How We Use Your Information</h2>
    <p>We use your information solely to provide the Service:</p>
    <ul>
      <li>✅ Authenticate your requests via ChatGPT</li>
      <li>✅ Execute Gmail and Calendar actions you explicitly request</li>
      <li>✅ Maintain your session and automatically refresh tokens</li>
      <li>✅ Debug issues and improve service reliability</li>
      <li>✅ Enforce rate limits to prevent abuse</li>
    </ul>
    
    <div class="highlight">
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
    <h2>4. Data Storage and Security</h2>
    
    <h3>4.1 Encryption</h3>
    <ul>
      <li>All OAuth tokens are encrypted using <strong>AES-256-GCM encryption</strong></li>
      <li>Encryption keys are stored separately from the database</li>
      <li>Data in transit uses <strong>TLS 1.3</strong></li>
    </ul>

    <h3>4.2 Storage Location</h3>
    <ul>
      <li>Encrypted tokens: MongoDB Atlas (cloud database)</li>
      <li>Server: Render.com (cloud hosting)</li>
      <li>Data centers: United States</li>
    </ul>

    <h3>4.3 Access Control</h3>
    <ul>
      <li>Only authenticated users can access their own data</li>
      <li>No manual access to encrypted tokens by administrators</li>
      <li>API rate limiting to prevent abuse</li>
    </ul>
  </div>

  <div class="section">
    <h2>5. Data Retention</h2>
    <p>We retain your data as follows:</p>
    <ul>
      <li><strong>OAuth Tokens:</strong> Until you revoke access or delete your account</li>
      <li><strong>Authorization Codes:</strong> 10 minutes (automatically deleted)</li>
      <li><strong>Proxy Tokens:</strong> 30 days (automatically cleaned up if expired)</li>
      <li><strong>API Logs:</strong> 90 days for debugging purposes</li>
    </ul>
  </div>

  <div class="section">
    <h2>6. Your Rights</h2>
    
    <h3>6.1 Access and Control</h3>
    <p>You have the right to:</p>
    <ul>
      <li>✅ Revoke access at any time via your <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a></li>
      <li>✅ Request deletion of your data</li>
      <li>✅ Access logs of your API usage</li>
      <li>✅ Export your data</li>
    </ul>

    <h3>6.2 How to Revoke Access</h3>
    <ol>
      <li>Visit <a href="https://myaccount.google.com/permissions" target="_blank">Google Account → Security → Third-party apps</a></li>
      <li>Find "MCP1 OAuth Server"</li>
      <li>Click "Remove Access"</li>
    </ol>
    <p>Your tokens will be immediately invalidated on Google's side.</p>
  </div>

  <div class="section">
    <h2>7. Google API Services User Data Policy</h2>
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
    <h2>8. Third-Party Services</h2>
    <p>We use the following third-party services:</p>
    <ul>
      <li><strong>Google OAuth 2.0:</strong> For authentication</li>
      <li><strong>Google Gmail API:</strong> For email operations</li>
      <li><strong>Google Calendar API:</strong> For calendar operations</li>
      <li><strong>MongoDB Atlas:</strong> For encrypted data storage</li>
      <li><strong>Render.com:</strong> For server hosting</li>
      <li><strong>OpenAI ChatGPT:</strong> For user interface (you initiate actions through ChatGPT)</li>
    </ul>
  </div>

  <div class="section">
    <h2>9. Children's Privacy</h2>
    <p>
      Our Service is not intended for users under 18 years of age. We do not knowingly collect 
      information from children. If you are a parent or guardian and believe your child has 
      provided us with personal information, please contact us.
    </p>
  </div>

  <div class="section">
    <h2>10. Changes to This Policy</h2>
    <p>
      We may update this Privacy Policy from time to time. We will notify you of any changes by 
      updating the "Last Updated" date at the top of this policy. Continued use of the Service 
      after changes constitutes acceptance of the updated policy.
    </p>
  </div>

  <div class="section">
    <h2>11. Data Breach Notification</h2>
    <p>
      In the unlikely event of a data breach that affects your personal information, we will:
    </p>
    <ul>
      <li>Notify affected users within 72 hours</li>
      <li>Describe the nature of the breach</li>
      <li>Explain steps taken to mitigate the breach</li>
      <li>Provide recommendations for protecting your account</li>
    </ul>
  </div>

  <div class="contact">
    <h2>12. Contact Us</h2>
    <p>If you have any questions about this Privacy Policy or our data practices, please contact us:</p>
    <ul>
      <li><strong>Project:</strong> MCP1 Gmail & Calendar OAuth Server</li>
      <li><strong>GitHub:</strong> <a href="https://github.com/vojtechbit/mcp1" target="_blank">github.com/vojtechbit/mcp1</a></li>
      <li><strong>Service URL:</strong> <a href="https://mcp1-oauth-server.onrender.com">mcp1-oauth-server.onrender.com</a></li>
    </ul>
  </div>

  <hr style="margin: 40px 0; border: none; border-top: 1px solid #ddd;">
  
  <p style="text-align: center; color: #7f8c8d; font-size: 14px;">
    © 2025 MCP1 OAuth Server. Built with privacy and security in mind.
  </p>
</body>
</html>
  `);
});

export default router;
