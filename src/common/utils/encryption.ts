import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer | null {
  const raw = process.env['ENCRYPTION_KEY'];
  if (!raw) return null;
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) return null;
  return key;
}

export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  tag: string;
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  if (!key) return plaintext;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    ciphertext,
    tag: tag.toString('hex'),
  });
}

export function decrypt(value: string): string {
  if (!value || !isEncryptionEnabled()) return value;
  try {
    const payload = JSON.parse(value) as EncryptedPayload;
    if (!payload.iv || !payload.tag) return value;
    const key = getKey();
    if (!key) return value;
    const iv = Buffer.from(payload.iv, 'hex');
    const tag = Buffer.from(payload.tag, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let plaintext = decipher.update(payload.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    return plaintext;
  } catch {
    return value;
  }
}
