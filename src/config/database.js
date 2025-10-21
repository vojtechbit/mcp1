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
      return await connectionPromise;
    } catch (error) {
      console.error('❌ Pending connection failed:', error.message);
      connectionPromise = null;
      throw error;
    }
  }

  // Start new connection with retries
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
      
      // Verify connection
      await db.admin().ping();
      console.log('✅ MongoDB ping successful');
      
      lastConnectionAttempt = Date.now();
      return db;
    } catch (error) {
      console.error('❌ MongoDB connection attempt failed:', error.message);
      db = null;
      client = null;
      throw error;
    }
  }).catch(error => {
    connectionPromise = null; // Reset so next request can try again
    throw error;
  });

  return connectionPromise;
}

async function getDatabase() {
  if (!db) {
    await connectToDatabase();
  }
  
  if (!db) {
    throw new Error('Database not initialized - connection failed');
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
