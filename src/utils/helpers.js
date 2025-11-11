/**
 * Utility functions for mail search
 */

import crypto from 'crypto';
import { REFERENCE_TIMEZONE } from '../config/limits.js';

const MS_IN_HOUR = 60 * 60 * 1000;
const ISO_LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

const pad = (value, length = 2) => String(value).padStart(length, '0');

function parseIsoDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${value}`);
  }

  return date;
}

function parseLocalDateTimeParts(value) {
  const match = ISO_LOCAL_DATE_TIME.exec(value);

  if (!match) {
    throw new Error(`Invalid Prague local datetime: ${value}`);
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second = '00',
    millisecond = '0'
  ] = match;

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    millisecond: Number((millisecond + '00').slice(0, 3))
  };
}

function formatLocalDateTimeParts({
  year,
  month,
  day,
  hour,
  minute,
  second,
  millisecond
}) {
  let formatted = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;

  if (millisecond) {
    formatted += `.${pad(millisecond, 3)}`;
  }

  return formatted;
}

function pragueLocalPartsToUtc(parts) {
  let guess = getPragueOffsetHours(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0))
  );

  if (!Number.isFinite(guess)) {
    guess = 1;
  }

  let utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond
  );

  for (let i = 0; i < 3; i += 1) {
    utcMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond
    ) - guess * MS_IN_HOUR;

    const actual = getPragueOffsetHours(new Date(utcMs));

    if (!Number.isFinite(actual) || actual === guess) {
      break;
    }

    guess = actual;
  }

  return new Date(utcMs);
}

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
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return 1;
  }

  try {
    // Use Prague-local date parts to derive the precise offset (handles DST automatically)
    const {
      year,
      month,
      day,
      hour,
      minute,
      second
    } = getPragueDateTimeParts(date);

    const pragueAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const offsetHours = (pragueAsUtcMs - date.getTime()) / MS_IN_HOUR;

    if (Number.isFinite(offsetHours)) {
      // Round to the nearest whole hour to avoid floating point drift (e.g., 1.999999 → 2)
      return Math.round(offsetHours);
    }
  } catch (error) {
    console.warn('Failed to derive Prague offset from date parts, falling back to name parsing:', error);
  }

  // Fallback: use timezone name (e.g., GMT+1, CET, CEST)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: REFERENCE_TIMEZONE,
    timeZoneName: 'short'
  });

  let tzName = '';
  try {
    const parts = formatter.formatToParts(date);
    tzName = parts.find(p => p.type === 'timeZoneName')?.value || '';
  } catch (error) {
    console.warn('Intl DateTimeFormat failed to provide timeZoneName, using DST heuristics:', error);
  }

  const gmtMatch = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (gmtMatch) {
    const sign = gmtMatch[1] === '-' ? -1 : 1;
    const hours = parseInt(gmtMatch[2], 10);
    return sign * hours;
  }

  if (/CEST/i.test(tzName)) {
    return 2;
  }
  if (/CET/i.test(tzName)) {
    return 1;
  }

  // Final fallback: compute DST transitions manually (last Sunday in March/October)
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
 * Parse ISO date string to Prague timezone day range
 * Converts "2025-11-07" to full day range in Prague timezone (00:00 to 23:59:59)
 *
 * @param {string} isoDateString - ISO date string like "2025-11-07"
 * @returns {object} { after, before } as Unix timestamps in seconds, or null if invalid
 */
export function parseIsoDateToPragueRange(isoDateString) {
  // Parse "2025-11-07" or "2025-11-07T..." → extract date parts
  const match = String(isoDateString).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }

  const parts = {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    day: parseInt(match[3], 10)
  };

  // Validate date parts
  if (parts.year < 1900 || parts.year > 2100 ||
      parts.month < 1 || parts.month > 12 ||
      parts.day < 1 || parts.day > 31) {
    return null;
  }

  const start = getPragueMidnightUtc(parts);
  const end = getPragueEndOfDayUtc(parts);

  return {
    after: Math.floor(start.getTime() / 1000),
    before: Math.floor(end.getTime() / 1000)
  };
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

    case 'last3d': {
      const threeDaysAgoPrague = addPragueDays(pragueNow, -3);
      const start = getPragueMidnightUtc(threeDaysAgoPrague);
      const end = getPragueEndOfDayUtc(pragueNow);

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
      const end = getPragueEndOfDayUtc(pragueNow); // Include today's full day

      return {
        after: toUnixSeconds(start),
        before: toUnixSeconds(end)
      };
    }

    case 'last14d': {
      const fourteenDaysAgoPrague = addPragueDays(pragueNow, -14);
      const start = getPragueMidnightUtc(fourteenDaysAgoPrague);
      const end = getPragueEndOfDayUtc(pragueNow);

      return {
        after: toUnixSeconds(start),
        before: toUnixSeconds(end)
      };
    }

    case 'last30d': {
      const thirtyDaysAgoPrague = addPragueDays(pragueNow, -30);
      const start = getPragueMidnightUtc(thirtyDaysAgoPrague);
      const end = getPragueEndOfDayUtc(pragueNow);

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
    return parseIsoDate(dateTimeString).toISOString();
  }

  // No timezone specified - interpret as Prague time and convert to UTC
  const parts = parseLocalDateTimeParts(dateTimeString);
  return pragueLocalPartsToUtc(parts).toISOString();
}

/**
 * Normalize a datetime string for Google Calendar API.
 * Ensures the requested wall-clock time is kept while tagging it with a timezone.
 *
 * Strategy:
 * 1. Remove any trailing timezone info (offset or Z suffix).
 * 2. Parse the remaining value as Prague local date-time parts.
 * 3. Return the formatted local timestamp together with the effective timezone.
 *
 * Examples:
 * - "2025-10-28T07:00:00+02:00" → { dateTime: "2025-10-28T07:00:00", timeZone: "Europe/Prague" }
 * - "2025-10-28T07:00:00" → { dateTime: "2025-10-28T07:00:00", timeZone: "Europe/Prague" }
 * - "2025-07-28T07:00:00Z" → { dateTime: "2025-07-28T07:00:00", timeZone: "Europe/Prague" }
 *
 * @param {string} dateTimeString - ISO 8601 datetime string
 * @param {string} [timeZone=REFERENCE_TIMEZONE] - timezone identifier to attach
 * @returns {object} Object with local dateTime and timezone metadata
 */
export function normalizeCalendarTime(dateTimeString, timeZone = REFERENCE_TIMEZONE) {
  if (!dateTimeString) {
    return null;
  }

  const effectiveTimeZone = timeZone || REFERENCE_TIMEZONE;
  let localDateTime = dateTimeString.trim();

  if (!localDateTime) {
    return null;
  }

  if (localDateTime.endsWith('Z')) {
    localDateTime = localDateTime.slice(0, -1);
  } else {
    localDateTime = localDateTime.replace(/[+-]\d{2}:\d{2}$/u, '');
  }

  const parts = parseLocalDateTimeParts(localDateTime);
  const formatted = formatLocalDateTimeParts(parts);

  return {
    dateTime: formatted,
    timeZone: effectiveTimeZone
  };
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

/**
 * Generate Google Sheets URL from spreadsheet ID
 * @param {string} spreadsheetId - Google Sheets spreadsheet ID
 * @returns {string} Full URL to the Google Sheet
 */
export function generateSheetUrl(spreadsheetId) {
  if (!spreadsheetId) return null;
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
