import { describe, expect, it } from 'vitest';
import { buildSrgbIccProfile } from '@/lib/pdf/icc_srgb';

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! << 24) |
    (bytes[offset + 1]! << 16) |
    (bytes[offset + 2]! << 8) |
    bytes[offset + 3]!
  );
}

function readSig(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

describe('buildSrgbIccProfile', () => {
  const profile = buildSrgbIccProfile();

  it('has a 128-byte header whose size field matches the actual byte length', () => {
    expect(readU32(profile, 0)).toBe(profile.length);
  });

  it('declares itself an RGB display profile connected through XYZ, per the ICC spec', () => {
    expect(readSig(profile, 12)).toBe('mntr');
    expect(readSig(profile, 16)).toBe('RGB ');
    expect(readSig(profile, 20)).toBe('XYZ ');
  });

  it('carries the required "acsp" file signature at byte 36', () => {
    expect(readSig(profile, 36)).toBe('acsp');
  });

  it('has a self-consistent tag table: every offset/size pair stays inside the buffer', () => {
    const tagCount = readU32(profile, 128);
    expect(tagCount).toBeGreaterThan(0);

    const names = new Set<string>();
    for (let i = 0; i < tagCount; i += 1) {
      const entryOffset = 132 + i * 12;
      const name = readSig(profile, entryOffset);
      const dataOffset = readU32(profile, entryOffset + 4);
      const dataSize = readU32(profile, entryOffset + 8);

      names.add(name);
      expect(dataOffset).toBeGreaterThanOrEqual(128);
      expect(dataOffset + dataSize).toBeLessThanOrEqual(profile.length);
      // Every tag's own data block starts with its own signature, confirming the offset is
      // actually pointing at that tag and not into the middle of another one.
      const expectedType =
        name === 'cprt'
          ? 'text'
          : name === 'desc'
            ? 'desc'
            : name === 'wtpt' || /XYZ$/.test(name)
              ? 'XYZ '
              : 'curv';
      expect(readSig(profile, dataOffset)).toBe(expectedType);
    }

    for (const required of [
      'desc',
      'cprt',
      'wtpt',
      'rXYZ',
      'gXYZ',
      'bXYZ',
      'rTRC',
      'gTRC',
      'bTRC',
    ]) {
      expect(names.has(required)).toBe(true);
    }
  });
});
