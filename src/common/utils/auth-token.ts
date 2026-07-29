import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'ma_';

export function generateAuthToken(botToken: string, telegramUserId: string): string {
  const payload = `${telegramUserId}:${Date.now()}`;
  const signature = createHmac('sha256', botToken).update(payload).digest('hex').slice(0, 16);
  const raw = `${payload}:${signature}`;
  return TOKEN_PREFIX + Buffer.from(raw).toString('base64url');
}

export function validateAuthToken(botToken: string, token: string): string | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  try {
    const decoded = Buffer.from(token.slice(TOKEN_PREFIX.length), 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length < 3) return null;
    const userId = parts[0];
    const timestamp = Number(parts[1]);
    const signature = parts[2];
    if (Number.isNaN(timestamp)) return null;
    if (Date.now() - timestamp > 3_600_000) return null;
    const payload = `${userId}:${timestamp}`;
    const expected = createHmac('sha256', botToken).update(payload).digest('hex').slice(0, 16);
    const actualBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) return null;
    return userId;
  } catch {
    return null;
  }
}
