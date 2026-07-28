import { encrypt, decrypt, isEncryptionEnabled } from './encryption';

const TEST_KEY = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

function withKey(): void {
  process.env['ENCRYPTION_KEY'] = TEST_KEY;
}

describe('encryption', () => {
  afterEach(() => {
    delete process.env['ENCRYPTION_KEY'];
  });

  it('should encrypt and decrypt a string when key is set', () => {
    withKey();
    const original = 'hello-world-secret';
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain('"iv"');

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should produce unique ciphertext each time (random IV)', () => {
    withKey();
    const a = encrypt('same-value');
    const b = encrypt('same-value');
    expect(a).not.toBe(b);
  });

  it('should handle empty string', () => {
    withKey();
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('should pass through when key is not set', () => {
    expect(isEncryptionEnabled()).toBe(false);
    const value = 'plaintext-value';
    expect(encrypt(value)).toBe(value);
    expect(decrypt(value)).toBe(value);
  });

  it('should return plaintext on failed decryption', () => {
    withKey();
    const encrypted = encrypt('secret-data');
    const tampered = encrypted.replace(/ciphertext":"[^"]+/, 'ciphertext":"deadbeef');
    const result = decrypt(tampered);
    expect(result).toBe(tampered);
  });
});
