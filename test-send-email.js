// Quick test to send email using stored tokens
import { connectToDatabase, getDatabase } from './src/config/database.js';
import { sendEmail } from './src/services/googleApiService.js';

async function testSendEmail() {
  try {
    console.log('🔄 Connecting to database...');
    await connectToDatabase();
    
    const db = await getDatabase();
    const users = await db.collection('users').find({}).toArray();
    
    if (users.length === 0) {
      console.error('❌ No users found in database!');
      process.exit(1);
    }
    
    const user = users[0];
    console.log('✅ Found user:', user.email);
    console.log('📧 Sending test email...\n');
    
    const result = await sendEmail(user.google_sub, {
      to: user.email, // Pošleme sami sobě
      subject: '🎉 Test email z MCP1 serveru!',
      body: 'Ahoj!\n\nTento email byl úspěšně poslán přes tvůj vlastní OAuth proxy server!\n\n✅ Gmail API funguje!\n✅ MongoDB funguje!\n✅ Encryption funguje!\n✅ Token refresh funguje!\n\nGratuluju! 🚀\n\n- Tvůj MCP1 Server'
    });
    
    console.log('✅ EMAIL ÚSPĚŠNĚ ODESLÁN!');
    console.log('Message ID:', result.id);
    console.log('\n📬 Zkontroluj svůj Gmail inbox!');
    console.log(`   Email byl poslán na: ${user.email}\n`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }
}

testSendEmail();
