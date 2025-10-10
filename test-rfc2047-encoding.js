// FINAL test with RFC 2047 Subject encoding
import { connectToDatabase, getDatabase } from './src/config/database.js';
import { sendEmail } from './src/services/googleApiService.js';

async function runRFC2047Test() {
  try {
    console.log('🔤 RFC 2047 TEST - Správné UTF-8 encoding podle dokumentace');
    console.log('='.repeat(70));
    
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
    
    console.log('📧 Posílám test email s českými znaky...');
    console.log('');
    
    const emailResult = await sendEmail(user.google_sub, {
      to: user.email,
      subject: '🎉 Test #6 - České znaky SPRÁVNĚ!',
      body: `Ahoj!

TENTO EMAIL POUŽÍVÁ RFC 2047 ENCODING PRO SUBJECT! 🎯

Testujeme:
✅ České znaky: ěščřžýáíéůúň
✅ Emoji v textu: 🎉 📧 🚀 ✨ 💡 😊
✅ Emoji v subject: 🎉
✅ UTF-8 encoding podle dokumentace

A je BEZ MCP1 attribution (default)!

Mělo by to KONEČNĚ fungovat! 🙏`,
      includeMcp1Attribution: false  // default, není třeba psát
    });
    
    console.log('✅ EMAIL POSLÁN!');
    console.log('   Message ID:', emailResult.id);
    console.log('');
    console.log('='.repeat(70));
    console.log('📬 ZKONTROLUJ GMAIL INBOX!');
    console.log('='.repeat(70));
    console.log('');
    console.log('Měl bys vidět:');
    console.log('  Subject: 🎉 Test #6 - České znaky SPRÁVNĚ!');
    console.log('  Body: Správné české znaky + emoji');
    console.log('  MCP1 attribution: BEZ (default)');
    console.log('');
    console.log('Pokud vidíš divné znaky, dej mi vědět!');
    console.log('='.repeat(70));
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED!');
    console.error('Error:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

runRFC2047Test();
