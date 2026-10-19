import crypto from 'crypto';

// Master key for encrypting upstream credentials at rest
// In production, this is supplied via Kubernetes Secret (GATEWAY_ENCRYPTION_KEY)
const ENCRYPTION_SECRET = process.env.GATEWAY_ENCRYPTION_KEY || 'urumi-master-secret-key-must-be-32-chars-long!';
// Derive a 32-byte key
const CIPHER_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

/**
 * Encrypt a secret string using AES-256-GCM
 */
export function encryptCredential(plainText) {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', CIPHER_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  // Format: iv:tag:ciphertext
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypt a secret string using AES-256-GCM
 */
export function decryptCredential(cipherPackage) {
  if (!cipherPackage) return '';
  try {
    const [ivHex, tagHex, encryptedHex] = cipherPackage.split(':');
    if (!ivHex || !tagHex || !encryptedHex) return '';
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', CIPHER_KEY, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[crypto] Decryption error:', err.message);
    return '';
  }
}

/**
 * Hash an API key for safe storage
 */
export function hashApiKey(apiKey) {
  const salt = 'urumi-salt-v1';
  return crypto.createHash('sha256').update(`${salt}:${apiKey}`).digest('hex');
}

/**
 * Generate a cryptographically secure API key
 */
export function generateApiKey(prefix = 'urumi_') {
  const randomPart = crypto.randomBytes(24).toString('base64url');
  return `${prefix}${randomPart}`;
}
