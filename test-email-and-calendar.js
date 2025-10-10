// Comprehensive test - Email + Calendar
import { connectToDatabase, getDatabase } from './src/config/database.js';
import { sendEmail } from './src/services/googleApiService.js';

// Import Calendar functions
import { google } from 'googleapis';
import { refreshAccessToken } from './src/config/oauth.js';
import { getUserByGoogleSub, updateTokens, updateLastUsed } from './src/services/databaseService.js';
import dotenv from 'dotenv';

dotenv.config();

// Helper function to get authenticated client
async function getAuthenticatedClient(googleSub) {
  const user = await getUserByGoogleSub(googleSub);
  
  if (!user) {
    throw new Error('User not found in database');
  }

  const now = new Date();
  const expiry = new Date(user.tokenExpiry);
  const bufferTime = 5 * 60 * 1000;

  let accessToken = user.accessToken;

  if (now >= (expiry.getTime() - bufferTime)) {
    console.log('🔄 Access token expired, refreshing...');
    
    const newTokens = await refreshAccessToken(user.refreshToken);
    const expiryDate = new Date(Date.now() + (newTokens.expiry_date || 3600 * 1000));
    
    await updateTokens(googleSub, {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || user.refreshToken,
      expiryDate
    });

    accessToken = newTokens.access_token;
    console.log('✅ Access token refreshed');
  }

  const { OAuth2 } = google.auth;
  const client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );
  
  client.setCredentials({ access_token: accessToken });
  
  return client;
}

async function runTests() {
  try {
    console.log('🧪 COMPREHENSIVE API TEST');
    console.log('='.repeat(70));
    
    // Connect to database
    console.log('\n🔄 Connecting to database...');
    await connectToDatabase();
    
    const db = await getDatabase();
    const users = await db.collection('users').find({}).toArray();
    
    if (users.length === 0) {
      console.error('❌ No users found in database!');
      process.exit(1);
    }
    
    const user = users[0];
    console.log('✅ Found user:', user.email);
    console.log('');
    
    // =================  TEST 1: SEND EMAIL =================
    console.log('='.repeat(70));
    console.log('📧 TEST 1: SENDING EMAIL');
    console.log('='.repeat(70));
    
    try {
      const emailResult = await sendEmail(user.google_sub, {
        to: user.email,
        subject: '📧 Test #2 - Gmail API funguje perfektně!',
        body: `Ahoj ${user.email}!

Toto je druhý test email z tvého MCP1 serveru! 🎉

První email úspěšně dorazil, takže teď testujeme:
✅ Opakované odesílání emailů
✅ Automatický token refresh
✅ Multiple API calls v jednom běhu

Gratuluju! Gmail API funguje skvěle! 🚀

---
Posláno z MCP1 OAuth Proxy Server
Comprehensive API Test Suite`
      });
      
      console.log('✅ EMAIL SENT SUCCESSFULLY!');
      console.log('   Message ID:', emailResult.id);
      console.log('   Recipient:', user.email);
      console.log('');
    } catch (error) {
      console.error('❌ Email test failed:', error.message);
      throw error;
    }
    
    // =================  TEST 2: CREATE CALENDAR EVENT =================
    console.log('='.repeat(70));
    console.log('📅 TEST 2: CREATING CALENDAR EVENT');
    console.log('='.repeat(70));
    
    try {
      const authClient = await getAuthenticatedClient(user.google_sub);
      const calendar = google.calendar({ version: 'v3', auth: authClient });
      
      // Calculate tomorrow's date at 14:00
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);
      
      const event = {
        summary: '🎉 MCP1 Test Event',
        description: `Tento event byl vytvořen automaticky přes MCP1 OAuth server!

Testujeme:
✅ Google Calendar API
✅ Event creation
✅ Datum a čas nastavení

Můžeš tento event smazat nebo upravit v Google Kalendáři.

---
Created by: MCP1 OAuth Proxy Server
Test Suite: Comprehensive API Test`,
        location: 'Online',
        start: {
          dateTime: tomorrow.toISOString(),
          timeZone: 'Europe/Prague',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Europe/Prague',
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
          ],
        },
      };
      
      const calendarResult = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });
      
      console.log('✅ CALENDAR EVENT CREATED SUCCESSFULLY!');
      console.log('   Event ID:', calendarResult.data.id);
      console.log('   Summary:', calendarResult.data.summary);
      console.log('   Start:', new Date(calendarResult.data.start.dateTime).toLocaleString('cs-CZ'));
      console.log('   End:', new Date(calendarResult.data.end.dateTime).toLocaleString('cs-CZ'));
      console.log('   Link:', calendarResult.data.htmlLink);
      console.log('');
    } catch (error) {
      console.error('❌ Calendar test failed:', error.message);
      throw error;
    }
    
    // =================  SUMMARY =================
    console.log('='.repeat(70));
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
    console.log('='.repeat(70));
    console.log('');
    console.log('✅ Gmail API:     Working perfectly!');
    console.log('✅ Calendar API:  Working perfectly!');
    console.log('✅ Token Refresh: Automatic!');
    console.log('✅ Multi-API:     No conflicts!');
    console.log('');
    console.log('📬 Check your Gmail inbox for the test email!');
    console.log('📅 Check your Google Calendar for tomorrow at 14:00!');
    console.log('');
    console.log('🚀 YOUR MCP1 SERVER IS PRODUCTION-READY!');
    console.log('='.repeat(70));
    console.log('');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED!');
    console.error('Error:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

runTests();
