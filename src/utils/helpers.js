/**
 * Utility functions for mail search
 */

import crypto from 'crypto';
import { REFERENCE_TIMEZONE } from '../config/limits.js';

/**
 * Get timezone offset for Europe/Prague in hours (accounts for DST)
 * 
 * FIX 20.10.2025: DST check was wrong (month >= 3 && <= 9 excluded October)
 * DST in Europe runs: last Sunday March to last Sunday October (inclusive)
 * So check should be month >= 2 && month <= 9 (March=2 through October=9)
 * 
 * @param {Date} date 
 * @returns {number} Offset in hours (e.g., 1 or 2)
 */
export function getPragueOffsetHours(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: REFERENCE_TIMEZONE,
    timeZoneName: 'short'
  });

  const parts = formatter.formatToParts(date);
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value || '';

  // Extract offset from timezone name (e.g., "GMT+1" or "GMT+2")
  if (tzName.includes('+')) {
    return parseInt(tzName.split('+')[1]);
  } else if (tzName.includes('-')) {
    return -parseInt(tzName.split('-')[1]);
  }

  // Fallback when Intl API cannot provide timezone information
  // Compute DST start/end manually: Europe/Prague switches at 01:00 UTC
  // on the last Sunday in March (to UTC+2) and the last Sunday in October (back to UTC+1)
  const year = date.getUTCFullYear();

  const getDstTransitionUtc = (monthIndex) => {
    const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0, 0, 0, 0, 0));
    const lastSundayDate = lastDayOfMonth.getUTCDate() - lastDayOfMonth.getUTCDay();
    return Date.UTC(year, monthIndex, lastSundayDate, 1, 0, 0, 0);
  };

  const dstStartUtc = getDstTransitionUtc(2); // March
  const dstEndUtc = getDstTransitionUtc(9); // October
  const timestamp = date.getTime();

  if (timestamp >= dstStartUtc && timestamp < dstEndUtc) {
    return 2; // Summer time UTC+2
  }

  return 1; // Winter time UTC+1
}

/**
 * Parse relative time keywords to concrete Unix timestamps (in seconds)
 * Reference timezone: Europe/Prague
 * 
 * @param {string} relative - One of: lastHour, last3h, last24h, today, yesterday, thisWeek, last7d
 * @returns {object} { after, before } as Unix timestamps in seconds
 */
export function parseRelativeTime(relative, referenceDate = new Date()) {
  const now = new Date(referenceDate);
  
  // Get Prague time components using Intl
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: REFERENCE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const pragueNow = {
    year: parseInt(parts.find(p => p.type === 'year').value),
    month: parseInt(parts.find(p => p.type === 'month').value),
    day: parseInt(parts.find(p => p.type === 'day').value),
    hour: parseInt(parts.find(p => p.type === 'hour').value),
    minute: parseInt(parts.find(p => p.type === 'minute').value),
    second: parseInt(parts.find(p => p.type === 'second').value)
  };
  
  // Helper to create UTC Date for midnight Prague time
  const createPragueMidnight = (year, month, day) => {
    // Midnight in Prague local time
    // To convert to UTC: subtract the offset for that specific date
    const utcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const offsetHoursForDate = getPragueOffsetHours(utcMidnight);
    const adjusted = new Date(utcMidnight.getTime() - (offsetHoursForDate * 60 * 60 * 1000));
    return adjusted;
  };

  const createPragueEndOfDay = (year, month, day) => {
    const nextDay = new Date(year, month - 1, day + 1);
    const nextMidnight = createPragueMidnight(
      nextDay.getFullYear(),
      nextDay.getMonth() + 1,
      nextDay.getDate()
    );
    return new Date(nextMidnight.getTime() - 1000);
  };
  
  const toUnixSeconds = (date) => Math.floor(date.getTime() / 1000);
  
  switch (relative?.toLowerCase()) {
    case 'today': {
      const start = createPragueMidnight(pragueNow.year, pragueNow.month, pragueNow.day);
      const end = createPragueEndOfDay(pragueNow.year, pragueNow.month, pragueNow.day);

      return {
        after: toUnixSeconds(start),
        before: toUnixSeconds(end)
      };
    }
    
    case 'tomorrow': {
      // Add one day to Prague date
      const tomorrow = new Date(pragueNow.year, pragueNow.month - 1, pragueNow.day + 1);
      const start = createPragueMidnight(
        tomorrow.getFullYear(),
        tomorrow.getMonth() + 1,
        tomorrow.getDate()
      );
      const end = createPragueEndOfDay(
        tomorrow.getFullYear(),
        tomorrow.getMonth() + 1,
        tomorrow.getDate()
      );

      return {
        after: toUnixSeconds(start),
        before: toUnixSeconds(end)
      };
    }
    
    case 'thisweek':
    case 'thisWeek': {
      // Find Monday of current week in Prague
      const currentDay = new Date(pragueNow.year, pragueNow.month - 1, pragueNow.day);
      const dayOfWeek = currentDay.getDay(); // 0 = Sunday
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      
      const monday = new Date(pragueNow.year, pragueNow.month - 1, pragueNow.day + daysToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      
      const start = createPragueMidnight(
        monday.getFullYear(),
        monday.getMonth() + 1,
        monday.getDate()
      );
      const end = createPragueEndOfDay(
        sunday.getFullYear(),
        sunday.getMonth() + 1,
        sunday.getDate()
      );
      
      return {
        after: toUnixSeconds(start),
        before: toUnixSeconds(end)
      };
    }
    
    case 'lasthour': {
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      return {
        after: toUnixSeconds(oneHourAgo),
        before: toUnixSeconds(now)
      };
    }
    
    case 'last3h': {
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      return {
        after: toUnixSeconds(threeHoursAgo),
        before: toUnixSeconds(now)
      };
    }
    
    case 'last24h': {
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return {
        after: toUnixSeconds(twentyFourHoursAgo),
        before: toUnixSeconds(now)
      };
    }
    
    case 'yesterday': {
      const yesterday = new Date(pragueNow.year, pragueNow.month - 1, pragueNow.day - 1);
      const start = createPragueMidnight(
        yesterday.getFullYear(),
        yesterday.getMonth() + 1,
        yesterday.getDate()
      );
      const end = createPragueEndOfDay(
        yesterday.getFullYear(),
        yesterday.getMonth() + 1,
        yesterday.getDate()
      );
      return {
        after: toUnixSeconds(start),
        before: toUnixSeconds(end)
      };
    }

    case 'last7d': {
      // FIX: Use Prague midnight (not UTC) - consistent with other relative filters
      // Calculate 7 days ago in Prague time
      const sevenDaysAgoPrague = new Date(
        pragueNow.year,
        pragueNow.month - 1,
        pragueNow.day - 7
      );
      
      const start = createPragueMidnight(
        sevenDaysAgoPrague.getFullYear(),
        sevenDaysAgoPrague.getMonth() + 1,
        sevenDaysAgoPrague.getDate()
      );
      const periodEnd = new Date(sevenDaysAgoPrague);
      periodEnd.setDate(periodEnd.getDate() + 7);
      const end = new Date(
        createPragueMidnight(
          periodEnd.getFullYear(),
          periodEnd.getMonth() + 1,
          periodEnd.getDate()
        ).getTime() - 1000
      );

      return {
        after: toUnixSeconds(start),
        before: toUnixSeconds(end)
      };
    }
    
    default:
      return null;
  }
}

/**
 * Normalize query string:
 * - Strip diacritics
 * - Escape unsafe characters
 * - Apply simple alias expansion
 * @param {string} query - Original query
 * @returns {string} Normalized query
 */
export function normalizeQuery(query) {
  if (!query) return '';
  
  // Strip diacritics
  let normalized = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  // Simple alias expansion
  const aliases = {
    'urgent': 'important OR urgent',
    'meeting': 'meeting OR meet',
    'invoice': 'invoice OR bill OR payment',
  };
  
  // Apply aliases (case-insensitive word matching)
  for (const [alias, expansion] of Object.entries(aliases)) {
    const regex = new RegExp(`\\b${alias}\\b`, 'gi');
    if (regex.test(normalized)) {
      normalized = normalized.replace(regex, `(${expansion})`);
    }
  }
  
  // Escape certain characters that might cause issues
  normalized = normalized.replace(/[<>]/g, '');
  
  return normalized;
}

/**
 * Compute ETag from response data
 * @param {any} data - Response data to hash
 * @returns {string} ETag value
 */
export function computeETag(data) {
  const hash = crypto.createHash('md5')
    .update(JSON.stringify(data))
    .digest('hex');
  return `"${hash}"`;
}

/**
 * Check if request ETag matches computed ETag
 * @param {string} requestETag - ETag from If-None-Match header
 * @param {string} computedETag - Computed ETag for response
 * @returns {boolean} True if they match
 */
export function checkETagMatch(requestETag, computedETag) {
  if (!requestETag || !computedETag) return false;
  return requestETag === computedETag;
}
