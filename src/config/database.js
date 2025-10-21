import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

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
const MIN_RETRY_DELAY = 1000; // 1 second minimum between attempts

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
  // If already connected and healthy, return immediately
  if (db) {
    try {
      // Quick health check
      await db.admin().ping();
      console.log('✅ Using existing MongoDB connection (healthy)');
      return db;
    } catch (error) {
      console.warn('⚠️  Existing connection unhealthy, reconnecting...');
      db = null;
      client = null;
    }
  }

  // If connection in progress, wait for it
  if (connectionPromise) {
    console.log('⏳ MongoDB connection in progress, waiting...');
    try {
      const result = await connectionPromise;
      console.log('[DEBUG] Waited for pending connection, got:', {
        resultExists: !!result,
        resultType: typeof result,
        hasCollection: result && typeof result.collection === 'function'
      });
      return result;
    } catch (error) {
      console.error('❌ Pending connection failed:', error.message);
      connectionPromise = null;
      throw error;
    }
  }

  // Start new connection with retries
  console.log('[DEBUG] Starting new MongoDB connection attempt...');
  
  connectionPromise = retryWithBackoff(async () => {
    try {
      console.log('🔗 Connecting to MongoDB Atlas...');
      
      client = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        retryWrites: true,
        retryReads: true
      });

      await client.connect();
      console.log('✅ Connected to MongoDB');

      db = client.db('oauth_db');
      console.log('[DEBUG] Obtained database object:', {
        dbType: typeof db,
        hasCollection: typeof db.collection === 'function'
      });
      
      // Verify connection
      await db.admin().ping();
      console.log('✅ MongoDB ping successful');
      
      lastConnectionAttempt = Date.now();
      console.log('[DEBUG] Returning db from retryWithBackoff, type:', typeof db);
      return db;
    } catch (error) {
      console.error('❌ MongoDB connection attempt failed:', error.message);
      db = null;
      client = null;
      throw error;
    }
  }).catch(error => {
    console.error('[DEBUG] retryWithBackoff failed, resetting connectionPromise');
    connectionPromise = null; // Reset so next request can try again
    throw error;
  });

  console.log('[DEBUG] Awaiting connectionPromise...');
  const result = await connectionPromise;
  console.log('[DEBUG] connectionPromise resolved to:', {
    resultExists: !!result,
    resultType: typeof result,
    hasCollection: result && typeof result.collection === 'function',
    globalDbSet: !!db
  });
  
  return result;
}

async function getDatabase() {
  console.log('[DEBUG] getDatabase() called. Current db state:', {
    dbExists: !!db,
    dbType: db ? typeof db : 'undefined',
    dbHasCollection: db && typeof db.collection === 'function',
    connectionPromiseExists: !!connectionPromise
  });

  if (!db) {
    console.log('[DEBUG] db is null/undefined, calling connectToDatabase()...');
    try {
      const result = await connectToDatabase();
      console.log('[DEBUG] connectToDatabase() completed. Result:', {
        resultType: typeof result,
        resultHasCollection: result && typeof result.collection === 'function'
      });
    } catch (error) {
      console.error('[DEBUG] connectToDatabase() threw error:', error.message);
      console.error('[DEBUG] After error, global db state:', {
        dbExists: !!db,
        dbType: db ? typeof db : 'undefined'
      });
      throw error;
    }
  }
  
  if (!db) {
    const error = new Error('Database not initialized - connection failed');
    console.error('[DEBUG] After connectToDatabase, db is still null:', error.message);
    throw error;
  }
  
  if (typeof db.collection !== 'function') {
    console.error('[DEBUG] ERROR: db object exists but .collection is not a function!', {
      dbType: typeof db,
      dbKeys: Object.keys(db),
      collectionType: typeof db.collection
    });
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
