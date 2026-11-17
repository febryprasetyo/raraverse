import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function parseAes256Key(keyHex: string): Buffer {
  const buf = Buffer.from(keyHex, 'hex');
  if (buf.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return buf;
}

/**
 * Encrypts sensitive OAuth tokens at rest using AES-256-GCM.
 */
export function encryptToken(plaintext: string, keyHex: string): EncryptedPayload {
  const key = parseAes256Key(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypts AES-256-GCM encrypted OAuth tokens and verifies integrity via authTag.
 */
export function decryptToken(payload: EncryptedPayload, keyHex: string): string {
  const key = parseAes256Key(keyHex);
  const iv = Buffer.from(payload.iv, 'hex');
  const authTag = Buffer.from(payload.authTag, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
