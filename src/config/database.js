import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { logDuration, startTimer } from '../utils/performanceLogger.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined in environment variables');
  console.error('   Add MONGODB_URI to .env file');
  process.exit(1);
}

let client;
let db;
let connectionPromise = null;
let lastConnectionAttempt = 0;

const MONGO_TIMEOUT_TIERS = [
  {
    name: 'fast',
    serverSelectionTimeoutMS: 2000,
    socketTimeoutMS: 10000,
    connectTimeoutMS: 5000
  },
  {
    name: 'standard',
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000
  }
];

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff(operation, maxAttempts = 5) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 1s, 2s, 4s, 8s, 10s max
        console.warn(`⚠️  Attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
        console.warn(`    Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

async function connectToDatabase() {
  const overallTimer = startTimer();

  // If already connected and healthy, return immediately
  if (db) {
    try {
      // Quick health check
      const pingTimer = startTimer();
      await db.admin().ping();
      logDuration('mongo.ping', pingTimer, { source: 'reuse-check' });
      logDuration('mongo.connectToDatabase', overallTimer, { status: 'reused' });
      console.log('✅ Using existing MongoDB connection (healthy)');
      return db;
    } catch (error) {
      logDuration('mongo.connectToDatabase', overallTimer, {
        status: 'reuse-failed',
        error: error.message
      });
      console.warn('⚠️  Existing connection unhealthy, reconnecting...');
      db = null;
      client = null;
    }
  }

  // If connection in progress, wait for it
  if (connectionPromise) {
    try {
      const result = await connectionPromise;
      logDuration('mongo.connectToDatabase', overallTimer, { status: 'await-existing' });
      return result;
    } catch (error) {
      logDuration('mongo.connectToDatabase', overallTimer, {
        status: 'await-existing-failed',
        error: error.message
      });
      console.error('❌ Pending connection failed:', error.message);
      connectionPromise = null;
      throw error;
    }
  }

  // Start new connection with retries
  let attemptNumber = 0;
  connectionPromise = retryWithBackoff(async () => {
    attemptNumber += 1;
    const attemptTimer = startTimer();
    try {
      console.log('🔗 Connecting to MongoDB Atlas...');

      const timeoutTier =
        MONGO_TIMEOUT_TIERS[Math.min(attemptNumber - 1, MONGO_TIMEOUT_TIERS.length - 1)];

      client = new MongoClient(MONGODB_URI, {
        ...timeoutTier,
        retryWrites: true,
        retryReads: true
      });

      const connectTimer = startTimer();
      await client.connect();
      logDuration('mongo.clientConnect', connectTimer, {
        attempt: attemptNumber,
        timeoutTier: timeoutTier.name
      });

      db = client.db('oauth_db');

      // Verify connection
      const pingTimer = startTimer();
      await db.admin().ping();
      logDuration('mongo.ping', pingTimer, {
        source: 'post-connect',
        attempt: attemptNumber
      });

      lastConnectionAttempt = Date.now();
      logDuration('mongo.connectToDatabase.attempt', attemptTimer, {
        attempt: attemptNumber,
        timeoutTier: timeoutTier.name
      });
      return db;
    } catch (error) {
      logDuration('mongo.connectToDatabase.attempt', attemptTimer, {
        attempt: attemptNumber,
        status: 'error',
        error: error.message
      });
      console.error('❌ MongoDB connection attempt failed:', error.message);
      db = null;
      client = null;
      throw error;
    }
  }).catch(error => {
    connectionPromise = null; // Reset so next request can try again
    throw error;
  });

  try {
    const result = await connectionPromise;
    logDuration('mongo.connectToDatabase', overallTimer, { status: 'connected' });
    return result;
  } catch (error) {
    logDuration('mongo.connectToDatabase', overallTimer, {
      status: 'error',
      error: error.message
    });
    throw error;
  }
}

async function getDatabase() {
  if (!db) {
    try {
      await connectToDatabase();
    } catch (error) {
      throw error;
    }
  }
  
  if (!db) {
    const error = new Error('Database not initialized - connection failed');
    throw error;
  }
  
  if (typeof db.collection !== 'function') {
    throw new Error(`Database object invalid: .collection is ${typeof db.collection}, expected function`);
  }
  
  return db;
}

async function closeDatabase() {
  if (client) {
    await client.close();
    console.log('✅ MongoDB connection closed');
    db = null;
    client = null;
    connectionPromise = null;
  }
}

export { connectToDatabase, getDatabase, closeDatabase };
