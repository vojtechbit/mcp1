/**
 * Configuration module for derived limits from REQUEST_BUDGET_15M
 * All limits are computed once at startup from a single environment variable
 */

const REQUEST_BUDGET_15M = parseInt(process.env.REQUEST_BUDGET_15M) || 600;

// Derive all limits at runtime
const RL_MAX_PER_IP = REQUEST_BUDGET_15M;
const RL_MAX_HEAVY_PER_IP = Math.ceil(REQUEST_BUDGET_15M / 4);
const PAGE_SIZE_DEFAULT = Math.min(100, Math.ceil(REQUEST_BUDGET_15M / 6));
const PAGE_SIZE_MAX = Math.min(200, Math.ceil(REQUEST_BUDGET_15M / 3));
const BATCH_PREVIEW_MAX_IDS = Math.min(200, Math.floor(REQUEST_BUDGET_15M / 3));
const BATCH_READ_MAX_IDS = Math.min(50, Math.floor(REQUEST_BUDGET_15M / 12));
const BATCH_READ_CONCURRENCY = 3;
const AGGREGATE_CAP_MAIL = 2000;
const AGGREGATE_CAP_CAL = 4000;
const RETRY_DELAYS_MS = [1000, 3000, 8000];

// Reference timezone for relative time parsing
const REFERENCE_TIMEZONE = 'Europe/Prague';

// Snapshot token TTL (2 minutes)
const SNAPSHOT_TTL_MS = 2 * 60 * 1000;

// Log derived values at startup
console.log('\n' + '='.repeat(60));
console.log('📊 DERIVED LIMITS (from REQUEST_BUDGET_15M=' + REQUEST_BUDGET_15M + ')');
console.log('='.repeat(60));
console.log(`  RL_MAX_PER_IP:          ${RL_MAX_PER_IP}`);
console.log(`  RL_MAX_HEAVY_PER_IP:    ${RL_MAX_HEAVY_PER_IP}`);
console.log(`  PAGE_SIZE_DEFAULT:      ${PAGE_SIZE_DEFAULT}`);
console.log(`  PAGE_SIZE_MAX:          ${PAGE_SIZE_MAX}`);
console.log(`  BATCH_PREVIEW_MAX_IDS:  ${BATCH_PREVIEW_MAX_IDS}`);
console.log(`  BATCH_READ_MAX_IDS:     ${BATCH_READ_MAX_IDS}`);
console.log(`  BATCH_READ_CONCURRENCY: ${BATCH_READ_CONCURRENCY}`);
console.log(`  AGGREGATE_CAP_MAIL:     ${AGGREGATE_CAP_MAIL}`);
console.log(`  AGGREGATE_CAP_CAL:      ${AGGREGATE_CAP_CAL}`);
console.log(`  RETRY_DELAYS_MS:        [${RETRY_DELAYS_MS.join(', ')}]`);
console.log(`  REFERENCE_TIMEZONE:     ${REFERENCE_TIMEZONE}`);
console.log(`  SNAPSHOT_TTL_MS:        ${SNAPSHOT_TTL_MS}ms`);
console.log('='.repeat(60) + '\n');

export {
  REQUEST_BUDGET_15M,
  RL_MAX_PER_IP,
  RL_MAX_HEAVY_PER_IP,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  BATCH_PREVIEW_MAX_IDS,
  BATCH_READ_MAX_IDS,
  BATCH_READ_CONCURRENCY,
  AGGREGATE_CAP_MAIL,
  AGGREGATE_CAP_CAL,
  RETRY_DELAYS_MS,
  REFERENCE_TIMEZONE,
  SNAPSHOT_TTL_MS
};
