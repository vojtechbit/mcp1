import * as googleApi from './src/services/googleApiService.js';

console.log('🔍 Testing googleApiService.js imports and structure...\n');

// Check all required functions are exported
const requiredFunctions = [
  'getValidAccessToken',
  'sendEmail',
  'readEmail',
  'searchEmails',
  'replyToEmail',
  'createDraft',
  'deleteEmail',
  'toggleStar',
  'markAsRead',
  'createCalendarEvent',
  'getCalendarEvent',
  'listCalendarEvents',
  'updateCalendarEvent',
  'deleteCalendarEvent'
];

let allGood = true;

console.log('📋 Checking exported functions:\n');

requiredFunctions.forEach(funcName => {
  if (typeof googleApi[funcName] === 'function') {
    console.log(`  ✅ ${funcName}`);
  } else {
    console.log(`  ❌ ${funcName} - NOT FOUND or NOT A FUNCTION`);
    allGood = false;
  }
});

console.log('\n' + '='.repeat(50));

if (allGood) {
  console.log('✅ ALL FUNCTIONS EXPORTED CORRECTLY!');
  console.log('✅ Structure looks good!');
  console.log('\nℹ️  Note: This only checks structure, not runtime behavior.');
  console.log('ℹ️  Full testing requires MongoDB and Google OAuth setup.');
  process.exit(0);
} else {
  console.log('❌ SOME FUNCTIONS ARE MISSING!');
  console.log('❌ Check the export statement at the end of the file.');
  process.exit(1);
}
