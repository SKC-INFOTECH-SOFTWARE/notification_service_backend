import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Generate a random API key: ns_live_<40 hex chars>
 */
export function generateApiKey(): string {
  const random = crypto.randomBytes(20).toString('hex');
  return `ns_skc_${random}`;
}

/**
 * Hash an API key for storage using bcrypt.
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  return bcrypt.hash(apiKey, 12);
}

/**
 * Compare a raw API key against a bcrypt hash.
 */
export async function compareApiKey(apiKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(apiKey, hash);
}

/**
 * Get the prefix of an API key for quick lookup (first 12 chars).
 */
export function getApiKeyPrefix(apiKey: string): string {
  return apiKey.substring(0, 12);
}

/**
 * Encrypt sensitive data (e.g., SMTP credentials) for storage.
 */
export function encryptCredential(data: Record<string, unknown>): string {
  const key = Buffer.from(config.credentialEncryptionKey, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(data);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt stored credentials.
 */
export function decryptCredential(encrypted: string): Record<string, unknown> {
  const key = Buffer.from(config.credentialEncryptionKey, 'hex');
  const [ivHex, authTagHex, ciphertext] = encrypted.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

/**
 * Hash a password for admin users.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
