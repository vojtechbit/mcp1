import crypto from 'crypto';
import { getDatabase } from '../config/database.js';
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';


/**
 * Idempotency Middleware
 * 
 * Prevents duplicate execution of mutations (POST/PUT/PATCH/DELETE)
 * Uses Idempotency-Key header or body.idempotency_key
 * 
 * Behavior:
 * - First occurrence: Execute action, store result, return it
 * - Same fingerprint: Return stored result (no re-execution)
 * - Different fingerprint with same key: 409 IDEMPOTENCY_KEY_REUSE_MISMATCH
 * 
 * TTL: 12 hours (auto-cleanup via MongoDB TTL index)
 */

const IDEMPOTENCY_TTL_HOURS = 12;

/**
 * Compute canonical JSON for fingerprinting
 * Removes idempotency_key and timestamp fields, then sorts keys
 */
function canonicalJson(obj) {
  if (!obj || typeof obj !== 'object') return JSON.stringify(obj);
  
  // Remove idempotency fields and timestamps
  const cleaned = { ...obj };
  delete cleaned.idempotency_key;
  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  delete cleaned.timestamp;
  
  // Sort keys recursively
  const sortObject = (o) => {
    if (Array.isArray(o)) {
      return o.map(sortObject);
    }
    if (o && typeof o === 'object') {
      return Object.keys(o).sort().reduce((result, key) => {
        result[key] = sortObject(o[key]);
        return result;
      }, {});
    }
    return o;
  };
  
  return JSON.stringify(sortObject(cleaned));
}

/**
 * Compute fingerprint for request
 */
function computeFingerprint(method, path, body) {
  const canonical = canonicalJson(body);
  const data = `${method}:${path}:${canonical}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Hash idempotency key for logging (privacy)
 */
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
}

/**
 * Idempotency middleware
 * Apply to routes that need idempotency protection
 */
async function idempotencyMiddleware(req, res, next) {
  // Only apply to mutations
  const method = req.method;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return next();
  }

  // Get idempotency key from header or body
  const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotency_key;
  
  // If no key provided, skip idempotency check
  if (!idempotencyKey) {
    return next();
  }

  const path = req.path;
  const body = req.body || {};
  const fingerprint = computeFingerprint(method, path, body);

  try {
    const db = await getDatabase();
    const collection = db.collection('idempotency_records');

    // Ensure indexes exist (safe to call multiple times)
    await collection.createIndex(
      { key: 1, method: 1, path: 1 },
      { unique: true }
    );
    await collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: IDEMPOTENCY_TTL_HOURS * 3600 }
    );

    // Look for existing record
    const existing = await collection.findOne({
      key: idempotencyKey,
      method,
      path
    });

    if (existing) {
      // Check fingerprint
      if (existing.fingerprint === fingerprint) {
        // Same request - return stored result (idempotency hit)
        console.log(`🔄 [IDEMPOTENCY] HIT - Key: ${hashKey(idempotencyKey)}, Method: ${method}, Path: ${path}`);
        
        return res.status(existing.status).json(existing.body);
      } else {
        // Different request with same key - conflict
        console.warn(`⚠️  [IDEMPOTENCY] CONFLICT - Key: ${hashKey(idempotencyKey)}, Method: ${method}, Path: ${path}`);
        
        return res.status(409).json({
          error: 'Idempotency key reuse mismatch',
          code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH',
          message: 'This idempotency key was already used with a different request body. Please use a new key for a different request.',
          idempotencyKey: hashKey(idempotencyKey)
        });
      }
    }

    // No existing record - this is a new request
    console.log(`✨ [IDEMPOTENCY] MISS - Key: ${hashKey(idempotencyKey)}, Method: ${method}, Path: ${path}`);

    // Store the key and fingerprint temporarily (will be updated after response)
    req.idempotency = {
      key: idempotencyKey,
      method,
      path,
      fingerprint,
      collection
    };

    // Intercept response to store result
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      // Store the result asynchronously (don't block response)
      if (req.idempotency) {
        const { key, method, path, fingerprint, collection } = req.idempotency;
        
        collection.updateOne(
          { key, method, path },
          {
            $set: {
              key,
              method,
              path,
              fingerprint,
              status: res.statusCode,
              body: data,
              createdAt: new Date()
            }
          },
          { upsert: true }
        ).catch(err => {
          console.error('❌ [IDEMPOTENCY] Failed to store record:', err.message);
        });
      }

      return originalJson(data);
    };

    next();
  } catch (error) {
    console.error('❌ [IDEMPOTENCY] Middleware error:', error);
    // Don't block request on idempotency errors
    next();
  }
}

/**
 * Clean up expired idempotency records manually (optional)
 * MongoDB TTL index handles this automatically, but this can force cleanup
 */
async function cleanupExpiredRecords() {
  try {
    const db = await getDatabase();
    const collection = db.collection('idempotency_records');
    
    const cutoff = new Date(Date.now() - IDEMPOTENCY_TTL_HOURS * 3600 * 1000);
    
    const result = await collection.deleteMany({
      createdAt: { $lt: cutoff }
    });

    console.log(`🧹 [IDEMPOTENCY] Cleaned up ${result.deletedCount} expired records`);
    return result.deletedCount;
  } catch (error) {
    console.error('❌ [IDEMPOTENCY] Cleanup error:', error);
    return 0;
  }
}

const traced = wrapModuleFunctions('middleware.idempotencyMiddleware', {
  idempotencyMiddleware,
  cleanupExpiredRecords,
});

const {
  idempotencyMiddleware: tracedIdempotencyMiddleware,
  cleanupExpiredRecords: tracedCleanupExpiredRecords,
} = traced;

export {
  tracedIdempotencyMiddleware as idempotencyMiddleware,
  tracedCleanupExpiredRecords as cleanupExpiredRecords,
};
