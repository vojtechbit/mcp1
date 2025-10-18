import { parseRelativeTime } from './src/utils/helpers.js';

console.log('\n=== Testing parseRelativeTime ===\n');

const tests = ['today', 'tomorrow', 'thisweek', 'lasthour'];

for (const test of tests) {
  const result = parseRelativeTime(test);
  if (result) {
    const afterDate = new Date(result.after * 1000);
    const beforeDate = new Date(result.before * 1000);
    
    console.log(`\n${test.toUpperCase()}:`);
    console.log(`  After:  ${result.after} (${afterDate.toISOString()} / ${afterDate.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })})`);
    console.log(`  Before: ${result.before} (${beforeDate.toISOString()} / ${beforeDate.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' })})`);
  }
}

console.log('\n');
