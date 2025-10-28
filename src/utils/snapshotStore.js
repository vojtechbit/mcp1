/**
 * In-memory snapshot store for stable iteration across paginated results
 * Snapshots expire after SNAPSHOT_TTL_MS (2 minutes)
 */

import crypto from 'crypto';
import { SNAPSHOT_TTL_MS } from '../config/limits.js';

// In-memory store: Map<snapshotToken, { query, timestamp, data }>
const snapshotStore = new Map();

/**
 * Create a new snapshot token for a query
 * @param {string} query - The search/list query
 * @param {any} data - Additional data to store (e.g., ordering params)
 * @returns {string} The snapshot token
 */
export function createSnapshot(query, data = {}) {
  const token = crypto.randomBytes(16).toString('hex');
  const snapshot = {
    query,
    data,
    timestamp: Date.now()
  };
  
  snapshotStore.set(token, snapshot);
  
  // Schedule cleanup
  setTimeout(() => {
    snapshotStore.delete(token);
  }, SNAPSHOT_TTL_MS);
  
  return token;
}

/**
 * Get snapshot data by token
 * @param {string} token - The snapshot token
 * @returns {object|null} The snapshot data or null if expired/not found
 */
export function getSnapshot(token) {
  if (!token) return null;
  
  const snapshot = snapshotStore.get(token);
  if (!snapshot) return null;
  
  // Check if expired
  if (Date.now() - snapshot.timestamp > SNAPSHOT_TTL_MS) {
    snapshotStore.delete(token);
    return null;
  }
  
  return snapshot;
}

/**
 * Clean up expired snapshots (called periodically)
 */
export function cleanupExpiredSnapshots() {
  const now = Date.now();
  for (const [token, snapshot] of snapshotStore.entries()) {
    if (now - snapshot.timestamp > SNAPSHOT_TTL_MS) {
      snapshotStore.delete(token);
    }
  }
}

const SNAPSHOT_DEBUG_ENTRY_LIMIT = 20;

export function getSnapshotDiagnostics() {
  const now = Date.now();
  const entries = [];

  for (const [token, snapshot] of snapshotStore.entries()) {
    const ageMs = now - snapshot.timestamp;
    entries.push({
      tokenPreview: token.slice(0, 8),
      ageMs,
      expiresInMs: Math.max(0, SNAPSHOT_TTL_MS - ageMs),
      hasData: snapshot && Object.keys(snapshot.data || {}).length > 0
    });
  }

  entries.sort((a, b) => (b.ageMs ?? 0) - (a.ageMs ?? 0));

  return {
    active: snapshotStore.size,
    ttlMs: SNAPSHOT_TTL_MS,
    entries: entries.slice(0, SNAPSHOT_DEBUG_ENTRY_LIMIT)
  };
}

export function clearSnapshots() {
  const removed = snapshotStore.size;
  snapshotStore.clear();
  return removed;
}

// Run cleanup every minute
setInterval(cleanupExpiredSnapshots, 60000);
