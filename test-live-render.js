// Test live Render server with proper authentication
import { connectToDatabase, getDatabase } from './src/config/database.js';
import { decryptToken } from './src/services/tokenService.js';
import fetch from 'node-fetch';

const RENDER_URL = 'https://mcp1-oauth-server.onrender.com';

async function testLiveServer() {
  try {
    console.log('🧪 TESTING LIVE RENDER SERVER');
    console.log('='.repeat(70));
    
    // Get access token from database
    console.log('🔄 Getting access token from MongoDB...');
    await connectToDatabase();
    const db = await getDatabase();
    const users = await db.collection('users').find({}).toArray();
    
    if (users.length === 0) {
      console.error('❌ No users found in database!');
      console.error('   Run OAuth flow first!');
      process.exit(1);
    }
    
    const user = users[0];
    
    // Decrypt access token
    const accessToken = decryptToken(
      user.encrypted_access_token,
      user.access_token_iv,
      user.access_token_auth_tag
    );
    
    console.log('✅ Got access token');
    console.log('📧 User:', user.email);
    console.log('');
    
    // Test 1: Send Email
    console.log('='.repeat(70));
    console.log('📧 TEST 1: Sending email via live server...');
    console.log('='.repeat(70));
    
    const emailResponse = await fetch(`${RENDER_URL}/api/gmail/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        to: user.email,
        subject: '🎉 Test z Live Render Serveru!',
        body: `Ahoj!

Tento email byl poslán z LIVE RENDER serveru! 🚀

✅ Server: ${RENDER_URL}
✅ MongoDB Atlas: Připojeno
✅ OAuth Authentication: Funguje
✅ Token Encryption: Funguje
✅ Gmail API: Funguje perfektně!

Gratuluju! Tvůj server je PRODUCTION-READY! 🎉

České znaky: ěščřžýáíé
Emoji: 🚀 📧 ✅ 🎉

---
Posláno z: MCP1 OAuth Proxy Server (Live Production)`,
        includeMcp1Attribution: false
      })
    });
    
    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('❌ Email API Error:', emailResponse.status);
      console.error('Details:', errorText);
      throw new Error('Email send failed');
    }
    
    const emailResult = await emailResponse.json();
    console.log('✅ EMAIL SENT!');
    console.log('   Message ID:', emailResult.messageId || emailResult.id);
    console.log('');
    
    // Test 2: Create Calendar Event
    console.log('='.repeat(70));
    console.log('📅 TEST 2: Creating calendar event via live server...');
    console.log('='.repeat(70));
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    
    const endTime = new Date(tomorrow);
    endTime.setHours(11, 0, 0, 0);
    
    const calendarResponse = await fetch(`${RENDER_URL}/api/calendar/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        summary: '🚀 Test Event z Render!',
        description: 'Tento event byl vytvořen z live production serveru!',
        location: 'Online',
        start: tomorrow.toISOString(),
        end: endTime.toISOString(),
        timeZone: 'Europe/Prague'
      })
    });
    
    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      console.error('❌ Calendar API Error:', calendarResponse.status);
      console.error('Details:', errorText);
      throw new Error('Calendar event creation failed');
    }
    
    const calendarResult = await calendarResponse.json();
    console.log('✅ CALENDAR EVENT CREATED!');
    console.log('   Event ID:', calendarResult.eventId);
    console.log('   Link:', calendarResult.htmlLink);
    console.log('');
    
    // Summary
    console.log('='.repeat(70));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(70));
    console.log('');
    console.log('✅ Live server: Working');
    console.log('✅ Authentication: Working');
    console.log('✅ Gmail API: Working');
    console.log('✅ Calendar API: Working');
    console.log('✅ MongoDB: Working');
    console.log('✅ Token encryption: Working');
    console.log('');
    console.log('📬 Check your Gmail inbox for the test email!');
    console.log('📅 Check your Google Calendar for tomorrow at 10:00!');
    console.log('');
    console.log('🚀 YOUR SERVER IS PRODUCTION-READY!');
    console.log('='.repeat(70));
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED!');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    process.exit(1);
  }
}

testLiveServer();
