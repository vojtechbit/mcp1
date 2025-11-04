#!/usr/bin/env node

/**
 * Debug Script: Production Load Simulation
 *
 * Simulates production load scenarios:
 * - Concurrent user requests
 * - Token refresh under load
 * - Rate limiting behavior
 * - Background job performance
 *
 * Usage:
 *   node scripts/simulate-production-load.js --scenario concurrent_requests
 *   node scripts/simulate-production-load.js --scenario background_refresh
 *   node scripts/simulate-production-load.js --scenario rate_limit_test
 */

import dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config();

const ANSI_COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function colorize(text, color) {
  return `${ANSI_COLORS[color]}${text}${ANSI_COLORS.reset}`;
}

async function simulateConcurrentRequests(count = 100) {
  console.log(colorize(`\n🚀 SIMULATING ${count} CONCURRENT REQUESTS`, 'bold'));
  console.log('='.repeat(60));

  const results = {
    successful: 0,
    failed: 0,
    rateLimited: 0,
    totalDuration: 0,
    responseTimes: []
  };

  const startTime = performance.now();

  const promises = Array(count).fill(null).map(async (_, index) => {
    const reqStart = performance.now();

    try {
      // Simulate API request to health endpoint
      const response = await fetch('http://localhost:3000/health');
      const reqDuration = performance.now() - reqStart;
      results.responseTimes.push(reqDuration);

      if (response.status === 200) {
        results.successful++;
      } else if (response.status === 429) {
        results.rateLimited++;
      } else {
        results.failed++;
      }
    } catch (error) {
      results.failed++;
      console.error(colorize(`  Request ${index + 1} failed: ${error.message}`, 'red'));
    }
  });

  await Promise.allSettled(promises);

  const totalDuration = performance.now() - startTime;
  results.totalDuration = totalDuration;

  // Calculate stats
  const avgResponseTime = results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length;
  const p95ResponseTime = results.responseTimes.sort((a, b) => a - b)[Math.floor(results.responseTimes.length * 0.95)];
  const p99ResponseTime = results.responseTimes.sort((a, b) => a - b)[Math.floor(results.responseTimes.length * 0.99)];

  console.log(colorize('\n📊 RESULTS', 'cyan'));
  console.log(`Total requests: ${count}`);
  console.log(colorize(`Successful: ${results.successful}`, 'green'));
  console.log(colorize(`Rate limited: ${results.rateLimited}`, 'yellow'));
  console.log(colorize(`Failed: ${results.failed}`, 'red'));
  console.log(`\nTotal duration: ${Math.round(totalDuration)}ms`);
  console.log(`Throughput: ${Math.round(count / (totalDuration / 1000))} req/s`);
  console.log(`\nResponse times:`);
  console.log(`  Average: ${Math.round(avgResponseTime)}ms`);
  console.log(`  P95: ${Math.round(p95ResponseTime)}ms`);
  console.log(`  P99: ${Math.round(p99ResponseTime)}ms`);

  console.log('\n' + '='.repeat(60));
}

async function simulateBackgroundRefresh() {
  console.log(colorize('\n🔄 SIMULATING BACKGROUND REFRESH', 'bold'));
  console.log('='.repeat(60));

  // Dynamically import after env is loaded
  const { refreshAllActiveTokens } = await import('../src/services/backgroundRefreshService.js');

  const startTime = performance.now();

  try {
    await refreshAllActiveTokens();
    const duration = performance.now() - startTime;

    console.log(colorize('\n✅ Background refresh completed', 'green'));
    console.log(`Duration: ${Math.round(duration)}ms`);
  } catch (error) {
    console.error(colorize('\n❌ Background refresh failed:', 'red'));
    console.error(error.message);
  }

  console.log('\n' + '='.repeat(60));
}

async function testRateLimiting() {
  console.log(colorize('\n⚡ TESTING RATE LIMITING', 'bold'));
  console.log('='.repeat(60));

  const maxRequests = 650; // Above default limit of 600/15min
  let rateLimitHit = false;
  let requestsBeforeLimit = 0;

  console.log(`Sending ${maxRequests} requests to test rate limiter...`);

  for (let i = 0; i < maxRequests; i++) {
    try {
      const response = await fetch('http://localhost:3000/api/status');

      if (response.status === 429) {
        rateLimitHit = true;
        requestsBeforeLimit = i;
        console.log(colorize(`\n🛑 Rate limit hit after ${i} requests`, 'yellow'));
        break;
      }

      if (i % 100 === 0 && i > 0) {
        console.log(`  Progress: ${i} requests sent...`);
      }
    } catch (error) {
      console.error(colorize(`Request ${i} failed: ${error.message}`, 'red'));
      break;
    }

    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  if (rateLimitHit) {
    console.log(colorize(`\n✅ Rate limiting is working correctly`, 'green'));
    console.log(`Limit threshold: ~${requestsBeforeLimit} requests`);
  } else {
    console.log(colorize(`\n⚠️  Rate limiting not triggered (unexpected)`, 'yellow'));
  }

  console.log('\n' + '='.repeat(60));
}

async function runScenario(scenario) {
  switch (scenario) {
    case 'concurrent_requests':
      await simulateConcurrentRequests(100);
      break;

    case 'background_refresh':
      await simulateBackgroundRefresh();
      break;

    case 'rate_limit_test':
      await testRateLimiting();
      break;

    default:
      console.error(colorize(`\n❌ Unknown scenario: ${scenario}`, 'red'));
      console.log('\nAvailable scenarios:');
      console.log('  - concurrent_requests');
      console.log('  - background_refresh');
      console.log('  - rate_limit_test');
      process.exit(1);
  }
}

// Parse args
const args = process.argv.slice(2);
const scenarioIndex = args.indexOf('--scenario');

if (scenarioIndex === -1 || !args[scenarioIndex + 1]) {
  console.error(colorize('\n❌ Missing --scenario argument', 'red'));
  console.log('\nUsage:');
  console.log('  node scripts/simulate-production-load.js --scenario <scenario_name>');
  console.log('\nAvailable scenarios:');
  console.log('  - concurrent_requests');
  console.log('  - background_refresh');
  console.log('  - rate_limit_test');
  process.exit(1);
}

const scenario = args[scenarioIndex + 1];
runScenario(scenario).then(() => process.exit(0)).catch(error => {
  console.error(colorize('\n❌ Simulation failed:', 'red'));
  console.error(error);
  process.exit(1);
});
