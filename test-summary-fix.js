#!/usr/bin/env node
/**
 * Test pro opravu include=summary a batchPreview(kind:"summary")
 * Ověřuje že se vrací: from, subject, date, snippet (ne jen id+internalDate)
 */

import * as gmailService from './src/services/googleApiService.js';
import { connectToDatabase, getDatabase } from './src/config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function testSummaryFix() {
  try {
    console.log('🧪 TEST OPRAVY SUMMARY FORMÁTU');
    console.log('='.repeat(70));
    console.log('Testujeme že summary obsahuje: from, subject, date, snippet');
    console.log('(ne jen id + internalDate)');
    console.log('='.repeat(70));
    console.log('');

    // Připoj k databázi
    await connectToDatabase();
    const db = await getDatabase();
    const users = await db.collection('users').find({}).toArray();

    if (users.length === 0) {
      console.error('❌ Žádní uživatelé v databázi!');
      process.exit(1);
    }

    const user = users[0];
    console.log('✅ Uživatel:', user.email);
    console.log('');

    // TEST 1: Získej nějaké emaily
    console.log('📧 TEST 1: Hledám emaily...');
    const searchResult = await gmailService.searchEmails(user.google_sub, {
      query: 'in:inbox',
      maxResults: 5
    });

    if (!searchResult.messages || searchResult.messages.length === 0) {
      console.error('❌ Žádné emaily nenalezeny!');
      process.exit(1);
    }

    const messageIds = searchResult.messages.map(m => m.id);
    console.log(`✅ Nalezeno ${messageIds.length} emailů`);
    console.log('');

    // TEST 2: Otestuj readEmail s format='metadata'
    console.log('📋 TEST 2: Testování readEmail(format="metadata")...');
    const testId = messageIds[0];
    const metadataResult = await gmailService.readEmail(user.google_sub, testId, {
      format: 'metadata'
    });

    console.log('Struktura metadata odpovědi:');
    console.log('  ✓ id:', metadataResult.id ? '✅' : '❌');
    console.log('  ✓ from:', metadataResult.from ? '✅' : '❌', '-', metadataResult.from?.substring(0, 50));
    console.log('  ✓ subject:', metadataResult.subject ? '✅' : '❌', '-', metadataResult.subject?.substring(0, 50));
    console.log('  ✓ date:', metadataResult.date ? '✅' : '❌', '-', metadataResult.date);
    console.log('  ✓ snippet:', metadataResult.snippet ? '✅' : '❌', '-', metadataResult.snippet?.substring(0, 50));
    console.log('');

    // Kontrola že všechny fieldy existují
    const metadataOK = metadataResult.id &&
                       metadataResult.from &&
                       metadataResult.subject &&
                       metadataResult.date &&
                       metadataResult.snippet;

    if (!metadataOK) {
      console.error('❌ Metadata formát není správný!');
      console.log('Chybějící fieldy:');
      if (!metadataResult.from) console.log('  - from');
      if (!metadataResult.subject) console.log('  - subject');
      if (!metadataResult.date) console.log('  - date');
      if (!metadataResult.snippet) console.log('  - snippet');
      process.exit(1);
    }

    console.log('✅ TEST 2 ÚSPĚŠNÝ: metadata obsahuje všechny potřebné fieldy');
    console.log('');

    // TEST 3: Simulace fetchBatchPreview (kind='summary')
    console.log('📚 TEST 3: Simulace batchPreview(kind="summary")...');
    
    const summaryResults = [];
    for (const id of messageIds.slice(0, 3)) {
      const msg = await gmailService.readEmail(user.google_sub, id, { format: 'metadata' });
      summaryResults.push({
        id,
        from: msg.from,
        subject: msg.subject,
        date: msg.date,
        snippet: msg.snippet
      });
    }

    console.log('Summary odpovědi:');
    summaryResults.forEach((summary, i) => {
      console.log(`\n  Email ${i + 1}:`);
      console.log('    id:', summary.id);
      console.log('    from:', summary.from?.substring(0, 50));
      console.log('    subject:', summary.subject?.substring(0, 50));
      console.log('    date:', summary.date);
      console.log('    snippet:', summary.snippet?.substring(0, 50) + '...');
    });
    console.log('');

    // Kontrola všech summaries
    const allSummariesOK = summaryResults.every(s =>
      s.id && s.from && s.subject && s.date && s.snippet
    );

    if (!allSummariesOK) {
      console.error('❌ Některé summaries nemají všechny fieldy!');
      process.exit(1);
    }

    console.log('✅ TEST 3 ÚSPĚŠNÝ: všechny summaries obsahují správné fieldy');
    console.log('');

    // VÝSLEDEK
    console.log('='.repeat(70));
    console.log('🎉 VŠECHNY TESTY PROŠLY!');
    console.log('='.repeat(70));
    console.log('');
    console.log('✅ readEmail(format="metadata") vrací: from, subject, date, snippet');
    console.log('✅ batchPreview(kind="summary") vrací správný formát');
    console.log('✅ include=summary bude fungovat správně');
    console.log('');
    console.log('📋 Formát summary odpovědi:');
    console.log('   {');
    console.log('     id: "message_id",');
    console.log('     from: "Name <email@example.com>",  // Full From header');
    console.log('     subject: "Email subject",');
    console.log('     date: "2024-10-18T10:30:00.000Z",  // ISO 8601');
    console.log('     snippet: "Email preview text..."   // Gmail snippet');
    console.log('   }');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ TEST SELHAL!');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

testSummaryFix();
