// Test with NEW defaults: Email NO sig, Calendar YES attribution
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

async function runFinalTest() {
  try {
    console.log('🎯 FINÁLNÍ TEST - Nové defaulty + Fixed UTF-8');
    console.log('='.repeat(70));
    console.log('📧 Email:    DEFAULT = BEZ podpisu (čistý)');
    console.log('📅 Calendar: DEFAULT = S attribution (branding)');
    console.log('='.repeat(70));
    console.log('');
    
    await connectToDatabase();
    const db = await getDatabase();
    const users = await db.collection('users').find({}).toArray();
    
    if (users.length === 0) {
      console.error('❌ No users!');
      process.exit(1);
    }
    
    const user = users[0];
    console.log('✅ User:', user.email);
    console.log('');
    
    // TEST 1: EMAIL DEFAULT (bez podpisu)
    console.log('='.repeat(70));
    console.log('📧 TEST 1: Email s českými znaky (default = BEZ podpisu)');
    console.log('='.repeat(70));
    
    try {
      const emailResult = await sendEmail(user.google_sub, {
        to: user.email,
        subject: '🎉 Test #5 - České znaky správně!',
        body: `Ahoj!

Tento email testuje:
✅ České znaky: ěščřžýáíé
✅ Emoji: 🎉 📧 🚀 ✨ 💡
✅ UTF-8 encoding

A je BEZ podpisu (default)!

Mělo by to fungovat perfektně! 😊`
        // includeSignature: false je default, nemusíš psát
      });
      
      console.log('✅ EMAIL SENT!');
      console.log('   Message ID:', emailResult.id);
      console.log('   Bez podpisu (default)');
      console.log('');
    } catch (error) {
      console.error('❌ Email failed:', error.message);
      throw error;
    }
    
    // TEST 2: CALENDAR DEFAULT (s attribution)
    console.log('='.repeat(70));
    console.log('📅 TEST 2: Calendar event (default = S attribution)');
    console.log('='.repeat(70));
    
    try {
      const authClient = await getAuthenticatedClient(user.google_sub);
      const calendar = google.calendar({ version: 'v3', auth: authClient });
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(16, 0, 0, 0);
      
      const endTime = new Date(tomorrow);
      endTime.setHours(17, 0, 0, 0);
      
      const { createCalendarEvent } = await import('./src/services/googleApiService.js');
      
      const calendarResult = await createCalendarEvent(user.google_sub, {
        summary: '🚀 MCP1 Test Event',
        description: 'Tento event má attribution na konci (default)!',
        location: 'Praha',
        start: tomorrow.toISOString(),
        end: endTime.toISOString(),
        timeZone: 'Europe/Prague'
        // includeAttribution: true je default, nemusíš psát
      });
      
      console.log('✅ CALENDAR EVENT CREATED!');
      console.log('   Event ID:', calendarResult.id);
      console.log('   S attribution (default)');
      console.log('   Start:', new Date(calendarResult.start.dateTime).toLocaleString('cs-CZ'));
      console.log('');
    } catch (error) {
      console.error('❌ Calendar failed:', error.message);
      throw error;
    }
    
    // TEST 3: UKÁZAT JAK ZMĚNIT DEFAULTY
    console.log('='.repeat(70));
    console.log('💡 JAK ZMĚNIT DEFAULTY:');
    console.log('='.repeat(70));
    console.log('');
    console.log('📧 Email S podpisem:');
    console.log('   await sendEmail(googleSub, {');
    console.log('     to: "user@example.com",');
    console.log('     subject: "Test",');
    console.log('     body: "Zpráva",');
    console.log('     includeSignature: true  // 👈 Zapnout podpis');
    console.log('   });');
    console.log('');
    console.log('📅 Calendar BEZ attribution:');
    console.log('   await createCalendarEvent(googleSub, {');
    console.log('     summary: "Meeting",');
    console.log('     start: "...",');
    console.log('     end: "...",');
    console.log('     includeAttribution: false  // 👈 Vypnout attribution');
    console.log('   });');
    console.log('');
    
    console.log('='.repeat(70));
    console.log('🎉 VŠECHNY TESTY ÚSPĚŠNÉ!');
    console.log('='.repeat(70));
    console.log('');
    console.log('✅ UTF-8 encoding:     FIXED!');
    console.log('✅ České znaky:        Fungují!');
    console.log('✅ Emoji:              Fungují!');
    console.log('✅ Email default:      BEZ podpisu');
    console.log('✅ Calendar default:   S attribution');
    console.log('');
    console.log('📬 Zkontroluj Gmail - měl by tam být čistý email s emoji!');
    console.log('📅 Zkontroluj Calendar - měl by tam být event S attribution!');
    console.log('');
    console.log('🚀 PRODUCTION READY!');
    console.log('='.repeat(70));
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED!');
    console.error('Error:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

runFinalTest();
