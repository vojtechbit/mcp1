#!/usr/bin/env node

/**
 * Debug Script: Token Health Check
 *
 * Analyzes all user tokens and reports:
 * - Tokens expiring soon
 * - Revoked tokens
 * - Failed refresh attempts
 * - Token age distribution
 *
 * Usage:
 *   node scripts/debug-token-health.js
 *   node scripts/debug-token-health.js --export-csv tokens-health.csv
 */

import dotenv from 'dotenv';
import { getDatabase } from '../src/config/database.js';
import fs from 'fs';

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

function formatDuration(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

async function analyzeTokenHealth() {
  console.log(colorize('\n🔍 TOKEN HEALTH CHECK', 'bold'));
  console.log('='.repeat(60));

  try {
    const db = await getDatabase();
    const users = await db.collection('users').find({}).toArray();

    if (users.length === 0) {
      console.log(colorize('⚪ No users found in database', 'yellow'));
      return;
    }

    const now = Date.now();
    const stats = {
      total: users.length,
      healthy: 0,
      expiringSoon: [],
      expired: [],
      revoked: [],
      refreshErrors: [],
      noExpiry: [],
      ageDistribution: {
        'under_1h': 0,
        '1h_6h': 0,
        '6h_24h': 0,
        'over_24h': 0
      }
    };

    users.forEach(user => {
      const email = user.email || 'unknown';
      const tokenExpiry = user.token_expiry ? new Date(user.token_expiry) : null;

      // Check revoked
      if (user.refresh_token_revoked) {
        stats.revoked.push({
          email,
          revokedAt: user.refresh_error?.at || 'unknown',
          error: user.refresh_error
        });
        return;
      }

      // Check refresh errors
      if (user.refresh_error) {
        stats.refreshErrors.push({
          email,
          error: user.refresh_error
        });
      }

      // Check expiry
      if (!tokenExpiry) {
        stats.noExpiry.push({ email });
        return;
      }

      const expiryTime = tokenExpiry.getTime();
      const timeUntilExpiry = expiryTime - now;

      // Token age distribution
      if (timeUntilExpiry < 0) {
        stats.expired.push({
          email,
          expiredAgo: formatDuration(-timeUntilExpiry),
          expiry: tokenExpiry
        });
      } else if (timeUntilExpiry < 10 * 60 * 1000) {
        // < 10 minutes
        stats.expiringSoon.push({
          email,
          expiresIn: formatDuration(timeUntilExpiry),
          expiry: tokenExpiry
        });
      } else if (timeUntilExpiry < 60 * 60 * 1000) {
        // < 1 hour
        stats.ageDistribution['under_1h']++;
        stats.healthy++;
      } else if (timeUntilExpiry < 6 * 60 * 60 * 1000) {
        // < 6 hours
        stats.ageDistribution['1h_6h']++;
        stats.healthy++;
      } else if (timeUntilExpiry < 24 * 60 * 60 * 1000) {
        // < 24 hours
        stats.ageDistribution['6h_24h']++;
        stats.healthy++;
      } else {
        // > 24 hours (unusual for Google tokens)
        stats.ageDistribution['over_24h']++;
        stats.healthy++;
      }
    });

    // Print summary
    console.log(colorize('\n📊 SUMMARY', 'cyan'));
    console.log(`Total users: ${stats.total}`);
    console.log(colorize(`Healthy: ${stats.healthy}`, 'green'));
    console.log(colorize(`Expiring soon (<10min): ${stats.expiringSoon.length}`, 'yellow'));
    console.log(colorize(`Expired: ${stats.expired.length}`, 'red'));
    console.log(colorize(`Revoked: ${stats.revoked.length}`, 'red'));
    console.log(colorize(`Refresh errors: ${stats.refreshErrors.length}`, 'yellow'));
    console.log(`No expiry data: ${stats.noExpiry.length}`);

    // Age distribution
    console.log(colorize('\n📈 TOKEN AGE DISTRIBUTION', 'cyan'));
    console.log(`< 1 hour:     ${stats.ageDistribution['under_1h']}`);
    console.log(`1-6 hours:    ${stats.ageDistribution['1h_6h']}`);
    console.log(`6-24 hours:   ${stats.ageDistribution['6h_24h']}`);
    console.log(`> 24 hours:   ${stats.ageDistribution['over_24h']} ${stats.ageDistribution['over_24h'] > 0 ? '⚠️' : ''}`);

    // Details
    if (stats.expiringSoon.length > 0) {
      console.log(colorize('\n⏰ EXPIRING SOON', 'yellow'));
      stats.expiringSoon.forEach(({ email, expiresIn }) => {
        console.log(`  • ${email} - expires in ${expiresIn}`);
      });
    }

    if (stats.expired.length > 0) {
      console.log(colorize('\n❌ EXPIRED TOKENS', 'red'));
      stats.expired.forEach(({ email, expiredAgo }) => {
        console.log(`  • ${email} - expired ${expiredAgo} ago`);
      });
    }

    if (stats.revoked.length > 0) {
      console.log(colorize('\n🚫 REVOKED TOKENS', 'red'));
      stats.revoked.forEach(({ email, error }) => {
        console.log(`  • ${email}`);
        if (error) {
          console.log(`    Error: ${error.errorCode} - ${error.message}`);
          console.log(`    At: ${error.at ? new Date(error.at).toISOString() : 'unknown'}`);
        }
      });
    }

    if (stats.refreshErrors.length > 0) {
      console.log(colorize('\n⚠️  REFRESH ERRORS (Not Revoked)', 'yellow'));
      stats.refreshErrors.forEach(({ email, error }) => {
        console.log(`  • ${email}`);
        console.log(`    Error: ${error.errorCode} (status ${error.status})`);
        console.log(`    Message: ${error.message}`);
        console.log(`    At: ${error.at ? new Date(error.at).toISOString() : 'unknown'}`);
      });
    }

    // Export to CSV if requested
    const args = process.argv.slice(2);
    const exportIndex = args.indexOf('--export-csv');
    if (exportIndex !== -1 && args[exportIndex + 1]) {
      const csvPath = args[exportIndex + 1];
      await exportToCsv(users, csvPath);
      console.log(colorize(`\n✅ Exported to ${csvPath}`, 'green'));
    }

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error(colorize('\n❌ Error analyzing tokens:', 'red'));
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

async function exportToCsv(users, csvPath) {
  const now = new Date();
  const rows = [
    ['Email', 'Google Sub', 'Token Expiry', 'Time Until Expiry (min)', 'Revoked', 'Last Used', 'Refresh Error']
  ];

  users.forEach(user => {
    const email = user.email || 'unknown';
    const googleSub = user.google_sub || 'unknown';
    const expiry = user.token_expiry ? new Date(user.token_expiry).toISOString() : 'N/A';
    const timeUntilExpiry = user.token_expiry
      ? Math.round((new Date(user.token_expiry).getTime() - now.getTime()) / (1000 * 60))
      : 'N/A';
    const revoked = user.refresh_token_revoked ? 'YES' : 'NO';
    const lastUsed = user.last_used ? new Date(user.last_used).toISOString() : 'Never';
    const refreshError = user.refresh_error
      ? `${user.refresh_error.errorCode} (${user.refresh_error.message})`
      : '';

    rows.push([email, googleSub, expiry, timeUntilExpiry, revoked, lastUsed, refreshError]);
  });

  const csvContent = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  fs.writeFileSync(csvPath, csvContent, 'utf8');
}

// Run
analyzeTokenHealth();
