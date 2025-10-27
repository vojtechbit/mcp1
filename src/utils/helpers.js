/**
 * Utility functions for mail search
 */

import crypto from 'crypto';
import { REFERENCE_TIMEZONE } from '../config/limits.js';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { parseISO } from 'date-fns';

const MS_IN_HOUR = 60 * 60 * 1000;

function resolveDateParts({ year, month, day }) {
  const normalized = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  return {
    year: normalized.getUTCFullYear(),
    month: normalized.getUTCMonth() + 1,
    day: normalized.getUTCDate()
  };
}

function ensurePragueParts(input) {
  if (input && typeof input === 'object' && 'year' in input && 'month' in input && 'day' in input) {
    return resolveDateParts(input);
  }

  return getPragueDateParts(input);
}

function getPragueDateTimeParts(date) {
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

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10)
  };
}

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

export function getPragueDateParts(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: REFERENCE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  return {
    year: parseInt(parts.find(p => p.type === 'year').value),
    month: parseInt(parts.find(p => p.type === 'month').value),
    day: parseInt(parts.find(p => p.type === 'day').value)
  };
}

export function getPragueMidnightUtc(input) {
  const { year, month, day } = ensurePragueParts(input);
  const midnightUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const offsetHoursForDate = getPragueOffsetHours(midnightUtc);
  return new Date(midnightUtc.getTime() - (offsetHoursForDate * MS_IN_HOUR));
}

export function getPragueEndOfDayUtc(input) {
  const { year, month, day } = ensurePragueParts(input);
  const nextDayParts = resolveDateParts({ year, month, day: day + 1 });
  const nextMidnight = getPragueMidnightUtc(nextDayParts);
  return new Date(nextMidnight.getTime() - 1000);
}

export function addPragueDays(input, days) {
  const { year, month, day } = ensurePragueParts(input);
  return resolveDateParts({ year, month, day: day + days });
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

  const pragueNow = getPragueDateTimeParts(now);
  
  const toUnixSeconds = (date) => Math.floor(date.getTime() / 1000);
  
  switch (relative?.toLowerCase()) {
    case 'today': {
      const start = getPragueMidnightUtc(pragueNow);
      const end = getPragueEndOfDayUtc(pragueNow);

      return {
        after: toUnixSeconds(start),
        before: toUnixSeconds(end)
      };
    }
    
    case 'tomorrow': {
      const tomorrow = addPragueDays(pragueNow, 1);
      const start = getPragueMidnightUtc(tomorrow);
      const end = getPragueEndOfDayUtc(tomorrow);

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

      const monday = addPragueDays(pragueNow, daysToMonday);
      const sunday = addPragueDays(monday, 6);

      const start = getPragueMidnightUtc(monday);
      const end = getPragueEndOfDayUtc(sunday);
      
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
      const yesterday = addPragueDays(pragueNow, -1);
      const start = getPragueMidnightUtc(yesterday);
      const end = getPragueEndOfDayUtc(yesterday);
      return {
        after: toUnixSeconds(start),
        before: toUnixSeconds(end)
      };
    }

    case 'last7d': {
      // FIX: Use Prague midnight (not UTC) - consistent with other relative filters
      // Calculate 7 days ago in Prague time
      const sevenDaysAgoPrague = addPragueDays(pragueNow, -7);

      const start = getPragueMidnightUtc(sevenDaysAgoPrague);
      const end = getPragueEndOfDayUtc(addPragueDays(sevenDaysAgoPrague, 6));

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
 * Convert a datetime string to UTC, interpreting it as Prague time if no timezone is specified.
 *
 * Examples:
 * - "2025-10-27T23:00:00" -> interpreted as 23:00 Prague time -> converted to UTC
 * - "2025-10-27T23:00:00Z" -> already UTC, returned as-is
 * - "2025-10-27T23:00:00+01:00" -> already has timezone, converted to UTC
 *
 * @param {string} dateTimeString - ISO 8601 datetime string
 * @returns {string} ISO 8601 datetime string in UTC (with Z suffix)
 */
export function convertToUtcIfNeeded(dateTimeString) {
  if (!dateTimeString) {
    return dateTimeString;
  }

  // If it already has timezone (ends with Z or has +/- offset), parse and convert to UTC
  if (dateTimeString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateTimeString)) {
    const date = parseISO(dateTimeString);
    return date.toISOString();
  }

  // No timezone specified - interpret as Prague time and convert to UTC
  // fromZonedTime takes a date in the specified timezone and converts it to UTC
  const pragueDate = parseISO(dateTimeString);
  const utcDate = fromZonedTime(pragueDate, REFERENCE_TIMEZONE);
  return utcDate.toISOString();
}

/**
 * Normalize a datetime string for Google Calendar API.
 * Converts to UTC, interpreting times without timezone as Prague local time.
 *
 * Strategy: ALWAYS convert to UTC by:
 * 1. Strip any wrong offset from GPT (e.g., +02:00 for winter dates)
 * 2. Interpret as Prague local time
 * 3. Convert to UTC using fromZonedTime (handles DST automatically)
 * 4. Return UTC string with Z suffix
 *
 * Why this works:
 * - GPT may send wrong offset (e.g., +02:00 for winter dates)
 * - We strip it and treat time as Prague local time
 * - Convert to UTC (fromZonedTime handles DST automatically)
 * - Google Calendar displays UTC time correctly in user's timezone
 *
 * Examples:
 * - "2025-10-28T07:00:00+02:00" (wrong offset) → "2025-10-28T06:00:00.000Z" (UTC)
 * - "2025-10-28T07:00:00" (no timezone) → "2025-10-28T06:00:00.000Z" (UTC)
 * - "2025-10-28T06:00:00Z" (already UTC) → "2025-10-28T06:00:00.000Z" (UTC)
 *
 * @param {string} dateTimeString - ISO 8601 datetime string
 * @returns {object} Object with dateTime in UTC
 */
export function normalizeCalendarTime(dateTimeString) {
  if (!dateTimeString) {
    return null;
  }

  // If already UTC (ends with Z), normalize and return
  if (dateTimeString.endsWith('Z')) {
    return { dateTime: parseISO(dateTimeString).toISOString() };
  }

  // Strip any timezone offset (e.g., +02:00, +01:00, -05:00)
  // This removes wrong offsets from GPT
  const withoutOffset = dateTimeString.replace(/[+-]\d{2}:\d{2}$/, '');

  // Parse as local time and convert to UTC
  // fromZonedTime interprets the time as being in the specified timezone
  // and converts it to UTC (handles DST automatically)
  const localTime = parseISO(withoutOffset);
  const utcTime = fromZonedTime(localTime, REFERENCE_TIMEZONE);

  return { dateTime: utcTime.toISOString() };
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
