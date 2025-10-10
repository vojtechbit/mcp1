// Fix token expiry in database (year 2081 bug)
import { connectToDatabase, getDatabase } from './src/config/database.js';

async function fixTokenExpiry() {
  try {
    console.log('🔧 FIXING TOKEN EXPIRY IN DATABASE');
    console.log('='.repeat(70));
    
    await connectToDatabase();
    const db = await getDatabase();
    const users = db.collection('users');
    
    // Find all users
    const allUsers = await users.find({}).toArray();
    
    console.log(`Found ${allUsers.length} user(s) in database\n`);
    
    for (const user of allUsers) {
      console.log('User:', user.email);
      console.log('  Current expiry:', new Date(user.token_expiry));
      
      const currentExpiry = new Date(user.token_expiry);
      const now = new Date();
      
      // Check if expiry is in the future beyond 1 day (likely bug)
      if (currentExpiry > new Date(Date.now() + 24 * 60 * 60 * 1000)) {
        console.log('  ⚠️  Expiry is too far in future - fixing...');
        
        // Set expiry to 1 hour from now (standard)
        const newExpiry = new Date(Date.now() + 3600 * 1000);
        
        await users.updateOne(
          { google_sub: user.google_sub },
          { 
            $set: { 
              token_expiry: newExpiry,
              updated_at: new Date()
            } 
          }
        );
        
        console.log('  ✅ Fixed! New expiry:', newExpiry);
      } else {
        console.log('  ✅ Expiry is OK');
      }
      console.log('');
    }
    
    console.log('='.repeat(70));
    console.log('✅ Token expiry fixed for all users!');
    console.log('='.repeat(70));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixTokenExpiry();
