import { md5Hex } from '@/lib/crypto/md5';

export type HashAlgorithm = 'MD5' | 'SHA1' | 'SHA256' | 'SHA384' | 'SHA512';

export const HASH_ALGORITHMS: HashAlgorithm[] = ['MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512'];

const SUBTLE_DIGEST_NAME: Record<Exclude<HashAlgorithm, 'MD5'>, string> = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA384: 'SHA-384',
  SHA512: 'SHA-512',
};

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashBytes(algorithm: HashAlgorithm, bytes: Uint8Array): Promise<string> {
  if (algorithm === 'MD5') return md5Hex(bytes);
  const digest = await crypto.subtle.digest(SUBTLE_DIGEST_NAME[algorithm], bytes.buffer as ArrayBuffer);
  return toHex(digest);
}

export interface HashRow {
  algorithm: HashAlgorithm;
  value: string;
}

export async function hashAll(algorithms: HashAlgorithm[], bytes: Uint8Array): Promise<HashRow[]> {
  return Promise.all(algorithms.map(async (algorithm) => ({ algorithm, value: await hashBytes(algorithm, bytes) })));
}
