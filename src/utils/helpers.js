/**
 * Utility functions for mail search
 */

import crypto from 'crypto';
import { REFERENCE_TIMEZONE } from '../config/limits.js';

/**
 * Parse relative time keywords to concrete after/before dates
 * Reference timezone: Europe/Prague
 * @param {string} relative - One of: today, tomorrow, thisWeek, lastHour
 * @returns {object} { after, before } in ISO format
 */
export function parseRelativeTime(relative) {
  const now = new Date();
  const tz = REFERENCE_TIMEZONE;
  
  // Helper to get start of day in Prague timezone
  const getStartOfDay = (date) => {
    const d = new Date(date.toLocaleString('en-US', { timeZone: tz }));
    d.setHours(0, 0, 0, 0);
    return d;
  };
  
  const getEndOfDay = (date) => {
    const d = new Date(date.toLocaleString('en-US', { timeZone: tz }));
    d.setHours(23, 59, 59, 999);
    return d;
  };
  
  switch (relative?.toLowerCase()) {
    case 'today': {
      const start = getStartOfDay(now);
      const end = getEndOfDay(now);
      return {
        after: start.toISOString(),
        before: end.toISOString()
      };
    }
    
    case 'tomorrow': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const start = getStartOfDay(tomorrow);
      const end = getEndOfDay(tomorrow);
      return {
        after: start.toISOString(),
        before: end.toISOString()
      };
    }
    
    case 'thisweek': {
      const pragueNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
      const dayOfWeek = pragueNow.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      
      const monday = new Date(pragueNow);
      monday.setDate(pragueNow.getDate() + mondayOffset);
      const start = getStartOfDay(monday);
      
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const end = getEndOfDay(sunday);
      
      return {
        after: start.toISOString(),
        before: end.toISOString()
      };
    }
    
    case 'lasthour': {
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      return {
        after: oneHourAgo.toISOString(),
        before: now.toISOString()
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
  // Gmail search handles most special chars, but let's be safe
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
