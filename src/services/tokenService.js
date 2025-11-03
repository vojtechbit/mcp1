import crypto from 'crypto';
import dotenv from 'dotenv';
import { wrapModuleFunctions } from '../utils/advancedDebugging.js';
import { throwServiceError } from './serviceErrors.js';

dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

// Validate encryption key
if (!ENCRYPTION_KEY) {
  console.error('❌ ENCRYPTION_KEY is not defined in .env');
  process.exit(1);
}

if (ENCRYPTION_KEY.length !== 64) {
  console.error('❌ ENCRYPTION_KEY must be 64 characters (32 bytes in hex)');
  console.error(`Current length: ${ENCRYPTION_KEY.length}`);
  process.exit(1);
}

// Convert hex string to Buffer
const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');

/**
 * Encrypt a token using AES-256-GCM
 * @param {string} token - The token to encrypt
 * @returns {object} - { encryptedToken, iv, authTag }
 */
function encryptToken(token) {
  try {
    // Generate unique IV for this encryption
    const iv = crypto.randomBytes(16);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
    
    // Encrypt
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const authTag = cipher.getAuthTag();
    
    return {
      encryptedToken: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    console.error('❌ [ENCRYPTION_ERROR] Failed to encrypt token');
    console.error('Details:', {
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    });
    throwServiceError('Token encryption failed', {
      code: 'TOKEN_ENCRYPTION_FAILED',
      statusCode: 500,
      cause: error
    });
  }
}

/**
 * Decrypt a token using AES-256-GCM
 * @param {string} encryptedToken - The encrypted token
 * @param {string} iv - Initialization vector (hex string)
 * @param {string} authTag - Authentication tag (hex string)
 * @returns {string} - Decrypted token
 */
function decryptToken(encryptedToken, iv, authTag) {
  try {
    // Convert hex strings to Buffers
    const ivBuffer = Buffer.from(iv, 'hex');
    const authTagBuffer = Buffer.from(authTag, 'hex');
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer);
    decipher.setAuthTag(authTagBuffer);
    
    // Decrypt
    let decrypted = decipher.update(encryptedToken, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('❌ [DECRYPTION_ERROR] Failed to decrypt token');
    console.error('Details:', {
      errorMessage: error.message,
      ivLength: iv?.length,
      authTagLength: authTag?.length,
      timestamp: new Date().toISOString()
    });
    throwServiceError('Token decryption failed - data may be corrupted', {
      code: 'TOKEN_DECRYPTION_FAILED',
      statusCode: 500,
      cause: error
    });
  }
}

/**
 * Test encryption/decryption (for debugging)
 */
function testEncryption() {
  const testToken = 'test_token_123456789';
  
  console.log('🔐 Testing encryption...');
  const encrypted = encryptToken(testToken);
  console.log('✅ Encryption successful');
  
  console.log('🔓 Testing decryption...');
  const decrypted = decryptToken(
    encrypted.encryptedToken,
    encrypted.iv,
    encrypted.authTag
  );
  
  if (decrypted === testToken) {
    console.log('✅ Encryption/Decryption test PASSED');
    return true;
  } else {
    console.error('❌ Encryption/Decryption test FAILED');
    return false;
  }
}

const traced = wrapModuleFunctions('services.tokenService', {
  encryptToken,
  decryptToken,
  testEncryption,
});

const {
  encryptToken: tracedEncryptToken,
  decryptToken: tracedDecryptToken,
  testEncryption: tracedTestEncryption,
} = traced;

export {
  tracedEncryptToken as encryptToken,
  tracedDecryptToken as decryptToken,
  tracedTestEncryption as testEncryption,
};
