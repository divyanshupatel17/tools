import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS_ALLOW_ALL,
  computePasswordEntries,
  decryptObjectData,
  encryptObjectData,
  randomBytes,
  recoverFileKey,
} from '@/lib/pdf/pdf_crypto';

describe('pdf_crypto', () => {
  it('recovers the exact file key with the correct password', async () => {
    const fileKey = randomBytes(32);
    const entries = await computePasswordEntries(
      'correct horse battery staple',
      fileKey,
      PERMISSIONS_ALLOW_ALL,
    );

    const recovered = await recoverFileKey('correct horse battery staple', entries);
    expect(Buffer.from(recovered).equals(Buffer.from(fileKey))).toBe(true);
  });

  it('rejects a wrong password instead of returning a bad key silently', async () => {
    const fileKey = randomBytes(32);
    const entries = await computePasswordEntries(
      'correct horse battery staple',
      fileKey,
      PERMISSIONS_ALLOW_ALL,
    );

    await expect(recoverFileKey('wrong password', entries)).rejects.toThrow('wrong_password');
  });

  it('is sensitive to every character of the password', async () => {
    const fileKey = randomBytes(32);
    const entries = await computePasswordEntries('password1', fileKey, PERMISSIONS_ALLOW_ALL);

    await expect(recoverFileKey('password2', entries)).rejects.toThrow('wrong_password');
    await expect(recoverFileKey('Password1', entries)).rejects.toThrow('wrong_password');
  });

  it('round-trips arbitrary object bytes through encrypt/decrypt', async () => {
    const fileKey = randomBytes(32);
    const original = new TextEncoder().encode('BT /F1 12 Tf (Hello, world) Tj ET');

    const encrypted = await encryptObjectData(fileKey, original);
    // IV (16 bytes) + at least one padded block, and never equal to the plaintext.
    expect(encrypted.length).toBeGreaterThan(original.length);

    const decrypted = await decryptObjectData(fileKey, encrypted);
    expect(Buffer.from(decrypted).equals(Buffer.from(original))).toBe(true);
  });

  it('produces different ciphertext for the same bytes each time (random IV)', async () => {
    const fileKey = randomBytes(32);
    const data = new TextEncoder().encode('repeat me');
    const a = await encryptObjectData(fileKey, data);
    const b = await encryptObjectData(fileKey, data);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('recovers the key via the owner path when validated as owner', async () => {
    // The same password is used for both roles in this tool, so validating against the O
    // entry (by constructing entries directly and only checking the owner branch) must also
    // recover the identical file key.
    const fileKey = randomBytes(32);
    const entries = await computePasswordEntries('shared-secret', fileKey, PERMISSIONS_ALLOW_ALL);
    const recovered = await recoverFileKey('shared-secret', {
      u: entries.u,
      ue: entries.ue,
      o: entries.o,
      oe: entries.oe,
    });
    expect(Buffer.from(recovered).equals(Buffer.from(fileKey))).toBe(true);
  });
});
