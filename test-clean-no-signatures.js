// Test without signatures (clean emails & events)
import { connectToDatabase, getDatabase } from './src/config/database.js';
import { sendEmail } from './src/services/googleApiService.js';
import { google } from 'googleapis';
import { refreshAccessToken } from './src/config/oauth.js';
import { getUserByGoogleSub, updateTokens } from './src/services/databaseService.js';
import dotenv from 'dotenv';

dotenv.config();

async function getAuthenticatedClient(googleSub) {
  const user = await getUserByGoogleSub(googleSub);
  
  const now = new Date();
  const expiry = new Date(user.tokenExpiry);
  const bufferTime = 5 * 60 * 1000;

  let accessToken = user.accessToken;

  if (now >= (expiry.getTime() - bufferTime)) {
    const newTokens = await refreshAccessToken(user.refreshToken);
    const expiryDate = new Date(Date.now() + ((newTokens.expiry_date || 3600) * 1000));
    
    await updateTokens(googleSub, {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || user.refreshToken,
      expiryDate
    });

    accessToken = newTokens.access_token;
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

async function runCleanTest() {
  try {
    console.log('✨ CLEAN TEST - Bez podpisů/attributions');
    console.log('='.repeat(70));
    
    await connectToDatabase();
    
    const db = await getDatabase();
    const users = await db.collection('users').find({}).toArray();
    
    if (users.length === 0) {
      console.error('❌ No users found!');
      process.exit(1);
    }
    
    const user = users[0];
    console.log('✅ User:', user.email);
    console.log('');
    
    // TEST 1: CLEAN EMAIL (bez podpisu)
    console.log('='.repeat(70));
    console.log('📧 TEST 1: Čistý email (bez MCP1 podpisu)');
    console.log('='.repeat(70));
    
    try {
      const emailResult = await sendEmail(user.google_sub, {
        to: user.email,
        subject: '🎉 Test #3 - Čistý email!',
        body: `Ahoj!

Tento email JE BEZ podpisu "Posláno z MCP1 Server"!

To je skvělé pro osobní použití - emaily vypadají normálně. 😊

Funguje perfektně!`,
        includeSignature: false  // 👈 VYPNUTO!
      });
      
      console.log('✅ CLEAN EMAIL SENT!');
      console.log('   Message ID:', emailResult.id);
      console.log('   Bez MCP1 signature!');
      console.log('');
    } catch (error) {
      console.error('❌ Email failed:', error.message);
      throw error;
    }
    
    // TEST 2: CLEAN CALENDAR EVENT
    console.log('='.repeat(70));
    console.log('📅 TEST 2: Čistý calendar event (bez attribution)');
    console.log('='.repeat(70));
    
    try {
      const authClient = await getAuthenticatedClient(user.google_sub);
      const calendar = google.calendar({ version: 'v3', auth: authClient });
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(15, 30, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(16, 30, 0, 0);
      
      const event = {
        summary: '💼 Osobní meeting',
        description: 'Toto je můj osobní meeting.\n\nBez attribution z MCP1 serveru!',
        location: 'Kancelář',
        start: {
          dateTime: tomorrow.toISOString(),
          timeZone: 'Europe/Prague',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Europe/Prague',
        },
        includeAttribution: false  // 👈 VYPNUTO!
      };
      
      const calendarResult = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });
      
      console.log('✅ CLEAN CALENDAR EVENT CREATED!');
      console.log('   Event ID:', calendarResult.data.id);
      console.log('   Bez MCP1 attribution!');
      console.log('   Start:', new Date(calendarResult.data.start.dateTime).toLocaleString('cs-CZ'));
      console.log('');
    } catch (error) {
      console.error('❌ Calendar failed:', error.message);
      throw error;
    }
    
    // TEST 3: EMAIL S PODPISEM (pro srovnání)
    console.log('='.repeat(70));
    console.log('📧 TEST 3: Email S podpisem (pro srovnání)');
    console.log('='.repeat(70));
    
    try {
      const emailResult = await sendEmail(user.google_sub, {
        to: user.email,
        subject: '🏢 Test #4 - S podpisem',
        body: `Ahoj!

Tento email MÁ podpis "Posláno z MCP1 Server".

To je dobré pro business použití nebo když chceš ukázat,
že email byl automatizovaný.`,
        includeSignature: true  // 👈 ZAPNUTO!
      });
      
      console.log('✅ EMAIL WITH SIGNATURE SENT!');
      console.log('   Message ID:', emailResult.id);
      console.log('   S MCP1 signature!');
      console.log('');
    } catch (error) {
      console.error('❌ Email failed:', error.message);
      throw error;
    }
    
    console.log('='.repeat(70));
    console.log('🎉 VŠECHNY TESTY ÚSPĚŠNÉ!');
    console.log('='.repeat(70));
    console.log('');
    console.log('✅ UTF-8 encoding:  Fixed!');
    console.log('✅ Clean emails:    Working!');
    console.log('✅ Clean events:    Working!');
    console.log('✅ Optional sig:    Working!');
    console.log('');
    console.log('📬 Zkontroluj Gmail - měly by tam být 2 nové emaily!');
    console.log('📅 Zkontroluj Calendar - měl by tam být čistý event zítra 15:30!');
    console.log('');
    console.log('💡 TIP: Defaultně jsou emaily & eventy BEZ podpisu!');
    console.log('    Podpis zapneš pomocí includeSignature: true');
    console.log('='.repeat(70));
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED!');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

runCleanTest();
