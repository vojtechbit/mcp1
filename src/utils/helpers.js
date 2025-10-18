/**
 * Utility functions for mail search
 */

import crypto from 'crypto';
import { REFERENCE_TIMEZONE } from '../config/limits.js';

/**
 * Get timezone offset for Europe/Prague in hours (accounts for DST)
 * @param {Date} date 
 * @returns {number} Offset in hours (e.g., 1 or 2)
 */
function getPragueOffsetHours(date) {
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
  
  // Fallback: manually check
  // Prague is UTC+1 in winter, UTC+2 in summer
  const january = new Date(date.getFullYear(), 0, 1);
  const july = new Date(date.getFullYear(), 6, 1);
  
  const formatter2 = new Intl.DateTimeFormat('en-US', {
    timeZone: REFERENCE_TIMEZONE,
    hour: '2-digit',
    hour12: false
  });
  
  // Check if it's DST by comparing with known values
  const janHour = parseInt(formatter2.format(new Date(Date.UTC(date.getFullYear(), 0, 1, 12, 0, 0))));
  const isDST = janHour === 13; // If 12 UTC shows as 13, it's UTC+1 (winter). If 14, it's UTC+2 (summer)
  
  // Actually, let's just check current month
  const month = date.getMonth();
  // DST in Europe: last Sunday of March to last Sunday of October
  // Rough approximation: April-September is DST
  if (month >= 3 && month <= 9) {
    return 2; // Summer time UTC+2
  } else {
    return 1; // Winter time UTC+1
  }
}

/**
 * Parse relative time keywords to concrete Unix timestamps (in seconds)
 * Reference timezone: Europe/Prague
 * 
 * @param {string} relative - One of: today, tomorrow, thisWeek, lastHour
 * @returns {object} { after, before } as Unix timestamps in seconds
 */
export function parseRelativeTime(relative) {
  const now = new Date();
  
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
  
  // Get offset
  const offsetHours = getPragueOffsetHours(now);
  
  // Helper to create UTC Date for midnight Prague time
  const createPragueMidnight = (year, month, day) => {
    // Midnight in Prague local time
    // To convert to UTC: subtract the offset
    const midnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const adjusted = new Date(midnight.getTime() - (offsetHours * 60 * 60 * 1000));
    return adjusted;
  };
  
  const toUnixSeconds = (date) => Math.floor(date.getTime() / 1000);
  
  switch (relative?.toLowerCase()) {
    case 'today': {
      const start = createPragueMidnight(pragueNow.year, pragueNow.month, pragueNow.day);
      const end = new Date(start.getTime() + (24 * 60 * 60 * 1000) - 1000);
      
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
      const end = new Date(start.getTime() + (24 * 60 * 60 * 1000) - 1000);
      
      return {
        after: toUnixSeconds(start),
        before: toUnixSeconds(end)
      };
    }
    
    case 'thisweek': {
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
      const end = createPragueMidnight(
        sunday.getFullYear(),
        sunday.getMonth() + 1,
        sunday.getDate() + 1 // End of Sunday = start of Monday
      );
      end.setTime(end.getTime() - 1000); // Minus 1 second
      
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
