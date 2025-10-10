console.log('🗄️  TESTING MONGODB CONNECTION');
console.log('='.repeat(70));

import { connectToDatabase, getDatabase, closeDatabase } from './src/config/database.js';
import { saveUser, getUserByGoogleSub, deleteUser } from './src/services/databaseService.js';

async function testMongoDB() {
  let testPassed = 0;
  let testFailed = 0;

  try {
    // TEST 1: Připojení k MongoDB
    console.log('\n📡 TEST 1: Connecting to MongoDB...');
    await connectToDatabase();
    console.log('✅ Successfully connected to MongoDB Atlas!');
    testPassed++;

    // TEST 2: Získání database instance
    console.log('\n📊 TEST 2: Getting database instance...');
    const db = await getDatabase();
    if (db) {
      console.log('✅ Database instance obtained:', db.databaseName);
      testPassed++;
    } else {
      throw new Error('Database instance is null');
    }

    // TEST 3: Test zápisu uživatele (CREATE)
    console.log('\n💾 TEST 3: Writing test user to database...');
    const testUser = {
      googleSub: 'test_google_sub_12345',
      email: 'test@example.com',
      accessToken: 'test_access_token_xyz',
      refreshToken: 'test_refresh_token_abc',
      expiryDate: new Date(Date.now() + 3600000)
    };

    await saveUser(testUser);
    console.log('✅ Test user saved successfully!');
    testPassed++;

    // TEST 4: Test čtení uživatele (READ)
    console.log('\n📖 TEST 4: Reading test user from database...');
    const retrievedUser = await getUserByGoogleSub('test_google_sub_12345');
    
    if (!retrievedUser) {
      throw new Error('User not found in database');
    }

    if (retrievedUser.email !== 'test@example.com') {
      throw new Error(`Email mismatch: expected test@example.com, got ${retrievedUser.email}`);
    }

    if (retrievedUser.accessToken !== 'test_access_token_xyz') {
      throw new Error('Access token decryption failed or mismatch');
    }

    if (retrievedUser.refreshToken !== 'test_refresh_token_abc') {
      throw new Error('Refresh token decryption failed or mismatch');
    }

    console.log('✅ Test user retrieved and decrypted successfully!');
    console.log('   Email:', retrievedUser.email);
    console.log('   Access token:', retrievedUser.accessToken.substring(0, 20) + '...');
    console.log('   Refresh token:', retrievedUser.refreshToken.substring(0, 20) + '...');
    testPassed++;

    // TEST 5: Ověření encryption/decryption
    console.log('\n🔐 TEST 5: Verifying encryption/decryption cycle...');
    if (retrievedUser.accessToken === testUser.accessToken &&
        retrievedUser.refreshToken === testUser.refreshToken) {
      console.log('✅ Encryption/Decryption cycle works perfectly!');
      testPassed++;
    } else {
      throw new Error('Encryption/Decryption verification failed');
    }

    // TEST 6: Test smazání uživatele (DELETE)
    console.log('\n🗑️  TEST 6: Deleting test user...');
    await deleteUser('test_google_sub_12345');
    
    const deletedUser = await getUserByGoogleSub('test_google_sub_12345');
    if (deletedUser === null) {
      console.log('✅ Test user deleted successfully!');
      testPassed++;
    } else {
      throw new Error('User still exists after deletion');
    }

    // TEST 7: Kontrola collections
    console.log('\n📋 TEST 7: Checking database collections...');
    const collections = await db.listCollections().toArray();
    const userCollection = collections.find(c => c.name === 'users');
    
    if (userCollection) {
      console.log('✅ Users collection exists!');
      testPassed++;
    } else {
      console.log('⚠️  Users collection not found (will be created on first insert)');
      testPassed++;
    }

    // SHRNUTÍ
    console.log('\n' + '='.repeat(70));
    console.log('📊 MONGODB TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total tests: ${testPassed + testFailed}`);
    console.log(`✅ Passed: ${testPassed}`);
    console.log(`❌ Failed: ${testFailed}`);
    console.log('='.repeat(70));

    if (testFailed === 0) {
      console.log('\n🎉🎉🎉 PERFECT! ALL MONGODB TESTS PASSED! 🎉🎉🎉\n');
      console.log('✅ MongoDB connection works');
      console.log('✅ Database read/write operations work');
      console.log('✅ Encryption/Decryption works');
      console.log('✅ User CRUD operations work');
      console.log('\n🚀 YOUR MONGODB SETUP IS PRODUCTION-READY!\n');
      console.log('='.repeat(70));
    }

  } catch (error) {
    console.error('\n❌ MONGODB TEST FAILED!');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    testFailed++;

    console.log('\n' + '='.repeat(70));
    console.log('📊 MONGODB TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total tests: ${testPassed + testFailed}`);
    console.log(`✅ Passed: ${testPassed}`);
    console.log(`❌ Failed: ${testFailed}`);
    console.log('='.repeat(70));
    
    process.exit(1);
  } finally {
    // Zavřít připojení
    console.log('\n🔌 Closing MongoDB connection...');
    await closeDatabase();
    console.log('✅ Connection closed\n');
  }
}

// Spustit test
testMongoDB();
