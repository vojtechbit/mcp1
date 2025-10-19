/**
 * Test script for validating all API limits
 * Run: node test-limits.js
 */

import dotenv from 'dotenv';
dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const TEST_TOKEN = process.env.TEST_TOKEN; // OAuth token pro testování

console.log('═══════════════════════════════════════════════════════');
console.log('           TEST VŠECH API LIMITŮ');
console.log('═══════════════════════════════════════════════════════\n');

// Helper funkce
async function testEndpoint(name, endpoint, data, expectedStatusCode = 400) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify(data)
    });

    const status = response.status;
    const result = await response.json();

    if (status === expectedStatusCode) {
      console.log(`✅ ${name}: PASS (očekávaný status ${expectedStatusCode})`);
      return true;
    } else {
      console.log(`❌ ${name}: FAIL (očekáván ${expectedStatusCode}, vrácen ${status})`);
      console.log(`   Response:`, result);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${name}: ERROR - ${error.message}`);
    return false;
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  console.log('TEST 1: inbox/snippets - maxItems limit (max 50)');
  console.log('─────────────────────────────────────────────────────');
  
  // Test: přijme 50 items (OK)
  if (await testEndpoint(
    'snippets s maxItems=50',
    '/macros/inbox/snippets',
    { timeRange: { relative: 'today' }, maxItems: 50 },
    200 // Mělo by být OK
  )) {
    passed++;
  } else {
    failed++;
  }

  // Test: odmítne 51 items (ERROR)
  if (await testEndpoint(
    'snippets s maxItems=51',
    '/macros/inbox/snippets',
    { timeRange: { relative: 'today' }, maxItems: 51 },
    400 // Mělo by vrátit chybu
  )) {
    passed++;
  } else {
    failed++;
  }

  // Test: odmítne 200 items (ERROR)
  if (await testEndpoint(
    'snippets s maxItems=200',
    '/macros/inbox/snippets',
    { timeRange: { relative: 'today' }, maxItems: 200 },
    400 // Mělo by vrátit chybu
  )) {
    passed++;
  } else {
    failed++;
  }

  console.log('\nTEST 2: inbox/overview - maxItems limit (max 200)');
  console.log('─────────────────────────────────────────────────────');
  
  // Test: přijme 200 items (OK)
  if (await testEndpoint(
    'overview s maxItems=200',
    '/macros/inbox/overview',
    { timeRange: { relative: 'today' }, maxItems: 200 },
    200 // Mělo by být OK
  )) {
    passed++;
  } else {
    failed++;
  }

  console.log('\nTEST 3: calendar/schedule - attendees limit (max 20)');
  console.log('─────────────────────────────────────────────────────');
  
  // Test: přijme 20 attendees (OK)
  if (await testEndpoint(
    'schedule s 20 attendees',
    '/macros/calendar/schedule',
    {
      title: 'Test Meeting',
      when: {
        fixed: {
          start: new Date(Date.now() + 86400000).toISOString(),
          end: new Date(Date.now() + 90000000).toISOString()
        }
      },
      attendees: Array(20).fill({ email: 'test@example.com', name: 'Test' })
    },
    200 // Mělo by být OK
  )) {
    passed++;
  } else {
    failed++;
  }

  // Test: odmítne 21 attendees (ERROR)
  if (await testEndpoint(
    'schedule s 21 attendees',
    '/macros/calendar/schedule',
    {
      title: 'Test Meeting',
      when: {
        fixed: {
          start: new Date(Date.now() + 86400000).toISOString(),
          end: new Date(Date.now() + 90000000).toISOString()
        }
      },
      attendees: Array(21).fill({ email: 'test@example.com', name: 'Test' })
    },
    400 // Mělo by vrátit chybu
  )) {
    passed++;
  } else {
    failed++;
  }

  console.log('\nTEST 4: calendar/schedule - reminders limit (max 5)');
  console.log('─────────────────────────────────────────────────────');
  
  // Test: přijme 5 reminders (OK)
  if (await testEndpoint(
    'schedule s 5 reminders',
    '/macros/calendar/schedule',
    {
      title: 'Test Meeting',
      when: {
        fixed: {
          start: new Date(Date.now() + 86400000).toISOString(),
          end: new Date(Date.now() + 90000000).toISOString()
        }
      },
      reminders: [15, 30, 60, 120, 1440]
    },
    200 // Mělo by být OK
  )) {
    passed++;
  } else {
    failed++;
  }

  // Test: odmítne 6 reminders (ERROR)
  if (await testEndpoint(
    'schedule s 6 reminders',
    '/macros/calendar/schedule',
    {
      title: 'Test Meeting',
      when: {
        fixed: {
          start: new Date(Date.now() + 86400000).toISOString(),
          end: new Date(Date.now() + 90000000).toISOString()
        }
      },
      reminders: [15, 30, 60, 120, 240, 1440]
    },
    400 // Mělo by vrátit chybu
  )) {
    passed++;
  } else {
    failed++;
  }

  console.log('\nTEST 5: contacts/safeAdd - entries limit (max 50)');
  console.log('─────────────────────────────────────────────────────');
  
  // Test: přijme 50 entries (OK)
  if (await testEndpoint(
    'safeAdd s 50 entries',
    '/macros/contacts/safeAdd',
    {
      entries: Array(50).fill({
        name: 'Test Contact',
        email: 'test@example.com'
      })
    },
    200 // Mělo by být OK
  )) {
    passed++;
  } else {
    failed++;
  }

  // Test: odmítne 51 entries (ERROR)
  if (await testEndpoint(
    'safeAdd s 51 entries',
    '/macros/contacts/safeAdd',
    {
      entries: Array(51).fill({
        name: 'Test Contact',
        email: 'test@example.com'
      })
    },
    400 // Mělo by vrátit chybu
  )) {
    passed++;
  } else {
    failed++;
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`                 VÝSLEDKY TESTŮ`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ Úspěšné: ${passed}`);
  console.log(`❌ Neúspěšné: ${failed}`);
  console.log(`📊 Celkem: ${passed + failed}`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failed === 0) {
    console.log('🎉 Všechny testy prošly úspěšně!');
    process.exit(0);
  } else {
    console.log('⚠️ Některé testy selhaly. Zkontrolujte výše uvedené detaily.');
    process.exit(1);
  }
}

// Kontrola, zda je TEST_TOKEN nastaven
if (!TEST_TOKEN) {
  console.log('❌ CHYBA: Prosím nastavte TEST_TOKEN v .env souboru');
  console.log('   TEST_TOKEN je OAuth access token pro testování');
  process.exit(1);
}

// Spuštění testů
runTests().catch(error => {
  console.error('❌ Kritická chyba při spouštění testů:', error);
  process.exit(1);
});
