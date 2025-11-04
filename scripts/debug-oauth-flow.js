#!/usr/bin/env node

/**
 * Debug Script: OAuth Flow Diagnostics
 *
 * Analyzes OAuth flows and auth codes:
 * - Active auth flows
 * - Expired auth codes
 * - Used/unused codes
 * - Flow completion rate
 *
 * Usage:
 *   node scripts/debug-oauth-flow.js
 *   node scripts/debug-oauth-flow.js --cleanup-expired
 */

import dotenv from 'dotenv';
import { getDatabase } from '../src/config/database.js';

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

async function analyzeOAuthFlows() {
  console.log(colorize('\n🔐 OAUTH FLOW DIAGNOSTICS', 'bold'));
  console.log('='.repeat(60));

  try {
    const db = await getDatabase();
    const flows = await db.collection('oauth_flows').find({}).toArray();

    if (flows.length === 0) {
      console.log(colorize('⚪ No OAuth flows found', 'yellow'));
      return;
    }

    const now = Date.now();
    const stats = {
      total: flows.length,
      active: [],
      expired: [],
      used: [],
      unused: [],
      completionRate: 0
    };

    flows.forEach(flow => {
      const expiresAt = flow.expires_at ? new Date(flow.expires_at) : null;
      const isExpired = expiresAt && expiresAt.getTime() < now;
      const isUsed = flow.used === true;

      if (isUsed) {
        stats.used.push({
          authCode: flow.auth_code.substring(0, 8) + '...',
          googleSub: flow.google_sub,
          usedAt: flow.used_at ? new Date(flow.used_at).toISOString() : 'unknown',
          createdAt: flow.created_at ? new Date(flow.created_at).toISOString() : 'unknown'
        });
      } else if (isExpired) {
        stats.expired.push({
          authCode: flow.auth_code.substring(0, 8) + '...',
          state: flow.state.substring(0, 8) + '...',
          expiredAt: expiresAt.toISOString(),
          createdAt: flow.created_at ? new Date(flow.created_at).toISOString() : 'unknown'
        });
      } else {
        stats.active.push({
          authCode: flow.auth_code.substring(0, 8) + '...',
          state: flow.state.substring(0, 8) + '...',
          expiresIn: Math.round((expiresAt.getTime() - now) / (1000 * 60)) + ' min',
          createdAt: flow.created_at ? new Date(flow.created_at).toISOString() : 'unknown'
        });
      }

      if (!isUsed && !isExpired) {
        stats.unused.push(flow);
      }
    });

    stats.completionRate = stats.total > 0
      ? Math.round((stats.used.length / stats.total) * 100)
      : 0;

    // Print summary
    console.log(colorize('\n📊 SUMMARY', 'cyan'));
    console.log(`Total flows: ${stats.total}`);
    console.log(colorize(`Active (unused, not expired): ${stats.active.length}`, 'green'));
    console.log(colorize(`Used (completed): ${stats.used.length}`, 'blue'));
    console.log(colorize(`Expired (never used): ${stats.expired.length}`, 'yellow'));
    console.log(`\nCompletion rate: ${colorize(stats.completionRate + '%', stats.completionRate > 80 ? 'green' : 'yellow')}`);

    // Details
    if (stats.active.length > 0) {
      console.log(colorize('\n✅ ACTIVE FLOWS', 'green'));
      stats.active.forEach(flow => {
        console.log(`  • Code: ${flow.authCode}, State: ${flow.state}`);
        console.log(`    Created: ${flow.createdAt}, Expires in: ${flow.expiresIn}`);
      });
    }

    if (stats.expired.length > 0) {
      console.log(colorize('\n⏰ EXPIRED FLOWS (Never Used)', 'yellow'));
      stats.expired.slice(0, 10).forEach(flow => {
        console.log(`  • Code: ${flow.authCode}, State: ${flow.state}`);
        console.log(`    Created: ${flow.createdAt}, Expired: ${flow.expiredAt}`);
      });
      if (stats.expired.length > 10) {
        console.log(`  ... and ${stats.expired.length - 10} more`);
      }
    }

    if (stats.used.length > 0) {
      console.log(colorize('\n📝 RECENTLY USED FLOWS', 'blue'));
      stats.used.slice(-5).forEach(flow => {
        console.log(`  • Code: ${flow.authCode}, User: ${flow.googleSub}`);
        console.log(`    Created: ${flow.createdAt}, Used: ${flow.usedAt}`);
      });
    }

    // Cleanup option
    const args = process.argv.slice(2);
    if (args.includes('--cleanup-expired') && stats.expired.length > 0) {
      console.log(colorize('\n🧹 CLEANUP: Removing expired flows...', 'yellow'));

      const result = await db.collection('oauth_flows').deleteMany({
        expires_at: { $lt: new Date() },
        used: { $ne: true }
      });

      console.log(colorize(`✅ Deleted ${result.deletedCount} expired flows`, 'green'));
    } else if (stats.expired.length > 0) {
      console.log(colorize('\n💡 TIP: Run with --cleanup-expired to remove expired flows', 'cyan'));
    }

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error(colorize('\n❌ Error analyzing OAuth flows:', 'red'));
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run
analyzeOAuthFlows();
