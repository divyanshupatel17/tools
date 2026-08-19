import { md5Hex } from '@/lib/crypto/md5';

export type UuidVersion = 'v1' | 'v3' | 'v4' | 'v5';

export interface UuidFormatOptions {
  uppercase: boolean;
  hyphen: boolean;
  braces: boolean;
}

export const NAMESPACE_PRESETS = {
  DNS: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  URL: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  OID: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  X500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8',
} as const;

// 100ns intervals between the UUID time epoch (1582-10-15) and the Unix epoch (1970-01-01).
const UUID_V1_EPOCH_OFFSET = 122192928000000000n;

let lastTimestamp100ns = 0n;
const clockSeq = BigInt(Math.floor(Math.random() * 0x3fff));

function nextTimestamp100ns(): bigint {
  let ts = BigInt(Date.now()) * 10000n + UUID_V1_EPOCH_OFFSET;
  if (ts <= lastTimestamp100ns) ts = lastTimestamp100ns + 1n;
  lastTimestamp100ns = ts;
  return ts;
}

function formatUuid(raw: string, options: UuidFormatOptions): string {
  let value = options.hyphen ? raw : raw.replace(/-/g, '');
  if (options.uppercase) value = value.toUpperCase();
  return options.braces ? `{${value}}` : value;
}

function rawUuidV1(): string {
  const ts = nextTimestamp100ns();
  const timeLow = (ts & 0xffffffffn).toString(16).padStart(8, '0');
  const timeMid = ((ts >> 32n) & 0xffffn).toString(16).padStart(4, '0');
  const timeHiAndVersion = (((ts >> 48n) & 0x0fffn) | 0x1000n).toString(16).padStart(4, '0');
  const clockSeqHiAndReserved = ((clockSeq >> 8n) & 0x3fn | 0x80n).toString(16).padStart(2, '0');
  const clockSeqLow = (clockSeq & 0xffn).toString(16).padStart(2, '0');
  const nodeBytes = new Uint8Array(6);
  crypto.getRandomValues(nodeBytes);
  // The multicast bit marks this node id as randomly generated rather than a real MAC address.
  nodeBytes[0] = (nodeBytes[0] ?? 0) | 0x01;
  const node = Array.from(nodeBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${timeLow}-${timeMid}-${timeHiAndVersion}-${clockSeqHiAndReserved}${clockSeqLow}-${node}`;
}

function rawUuidV4(): string {
  return crypto.randomUUID();
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function nameBasedInput(namespace: string, name: string): Uint8Array {
  const namespaceBytes = uuidToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length);
  input.set(namespaceBytes);
  input.set(nameBytes, namespaceBytes.length);
  return input;
}

async function rawUuidV3(namespace: string, name: string): Promise<string> {
  const hashHex = md5Hex(nameBasedInput(namespace, name));
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Number.parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x30;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

async function rawUuidV5(namespace: string, name: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', nameBasedInput(namespace, name).buffer as ArrayBuffer);
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

export interface GenerateUuidsInput {
  version: UuidVersion;
  count: number;
  format: UuidFormatOptions;
  namespace?: string;
  name?: string;
}

export async function generateUuids(input: GenerateUuidsInput): Promise<string[]> {
  const { version, count, format, namespace, name } = input;

  if (version === 'v1') {
    return Array.from({ length: count }, () => formatUuid(rawUuidV1(), format));
  }
  if (version === 'v4') {
    return Array.from({ length: count }, () => formatUuid(rawUuidV4(), format));
  }

  // v3 and v5 are deterministic: the same namespace and name always hash to the same UUID.
  const raw = version === 'v3' ? await rawUuidV3(namespace ?? '', name ?? '') : await rawUuidV5(namespace ?? '', name ?? '');
  return [formatUuid(raw, format)];
}
