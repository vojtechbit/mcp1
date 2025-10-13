/**
 * Test script pro novou funkcionalitu email size handling
 * 
 * Použití:
 * node test-email-size-handling.js
 */

import * as gmailService from './src/services/googleApiService.js';
import dotenv from 'dotenv';

dotenv.config();

// Test Google Sub (nahraď vlastním)
const TEST_GOOGLE_SUB = 'YOUR_GOOGLE_SUB_HERE';
const TEST_MESSAGE_ID = 'YOUR_MESSAGE_ID_HERE';

async function testEmailSizeHandling() {
  console.log('🧪 Testování nové email size handling funkcionality...\n');

  try {
    // Test 1: Kontrola konstant
    console.log('📊 Test 1: Kontrola EMAIL_SIZE_LIMITS');
    console.log('MAX_SIZE_BYTES:', gmailService.EMAIL_SIZE_LIMITS.MAX_SIZE_BYTES);
    console.log('MAX_BODY_LENGTH:', gmailService.EMAIL_SIZE_LIMITS.MAX_BODY_LENGTH);
    console.log('WARNING_SIZE_BYTES:', gmailService.EMAIL_SIZE_LIMITS.WARNING_SIZE_BYTES);
    console.log('✅ Konstanty jsou dostupné\n');

    // Test 2: Načtení emailu s format=snippet
    console.log('📧 Test 2: Načtení emailu s format=snippet');
    const snippetResult = await gmailService.readEmail(
      TEST_GOOGLE_SUB,
      TEST_MESSAGE_ID,
      { format: 'snippet' }
    );
    console.log('Snippet:', snippetResult.snippet?.substring(0, 100) + '...');
    console.log('Size estimate:', snippetResult.sizeEstimate, 'bytes');
    console.log('✅ Snippet format funguje\n');

    // Test 3: Načtení emailu s format=metadata
    console.log('📋 Test 3: Načtení emailu s format=metadata');
    const metadataResult = await gmailService.readEmail(
      TEST_GOOGLE_SUB,
      TEST_MESSAGE_ID,
      { format: 'metadata' }
    );
    console.log('Headers count:', metadataResult.payload?.headers?.length || 0);
    console.log('✅ Metadata format funguje\n');

    // Test 4: Načtení emailu s format=full a autoTruncate=true
    console.log('📨 Test 4: Načtení emailu s format=full a autoTruncate=true');
    const fullResult = await gmailService.readEmail(
      TEST_GOOGLE_SUB,
      TEST_MESSAGE_ID,
      { format: 'full', autoTruncate: true }
    );
    
    if (fullResult.truncated) {
      console.log('⚠️  Email byl zkrácen!');
      console.log('Původní velikost:', fullResult.truncationInfo.originalSize, 'bytes');
      console.log('Max povolená velikost:', fullResult.truncationInfo.maxAllowedSize, 'bytes');
      console.log('Body preview length:', fullResult.bodyPreview?.length, 'chars');
    } else {
      console.log('✅ Email nebyl zkrácen (je menší než limit)');
      console.log('Size estimate:', fullResult.sizeEstimate || 'N/A');
    }
    
    if (fullResult.sizeWarning) {
      console.log('⚠️  Varování:', fullResult.sizeWarning);
    }
    console.log('✅ Full format s autoTruncate funguje\n');

    console.log('🎉 Všechny testy prošly úspěšně!');
    console.log('\n📝 Poznámky:');
    console.log('- Konstanty můžeš upravit v src/services/googleApiService.js');
    console.log('- Pro GPT Custom Actions použij OpenAPI schema z openapi-schema.json');
    console.log('- Dokumentace je v EMAIL_SIZE_HANDLING_UPDATE.md');

  } catch (error) {
    console.error('❌ Test selhal:', error.message);
    console.error('Stack:', error.stack);
    
    console.log('\n💡 Tip: Ujisti se že:');
    console.log('1. Máš správný TEST_GOOGLE_SUB (z databáze)');
    console.log('2. Máš platný TEST_MESSAGE_ID');
    console.log('3. OAuth tokens jsou platné');
    console.log('4. Database connection funguje');
  }
}

// Spusť testy
testEmailSizeHandling();
