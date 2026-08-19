'use client';

/**
 * PDF Standard Security Handler, revision 6 (AES-256), per ISO 32000-2 Annex. This is the
 * modern handler — every current reader (Acrobat, Chrome/Firefox's built-in viewers, Preview)
 * supports it; the legacy RC4 / AES-128 handlers (revisions 2-4) are not implemented, since
 * they exist only for backward compatibility with pre-2017 readers.
 *
 * Everything here is built on Web Crypto's native AES-CBC and SHA-256/384/512 — no bundled
 * crypto library. AES-CBC in the browser always applies PKCS#7 padding and there is no way to
 * turn that off, but three places in the spec (the U/O password-validation hashes wrapping the
 * file key, and the /Perms block) are defined as *unpadded* CBC/ECB on data that is already a
 * whole number of blocks. `ecbEncryptBlock` derives a raw single-block AES-ECB primitive from
 * CBC-with-a-zero-IV (the first block of CBC-with-zero-IV *is* ECB of that block; the padding
 * block Web Crypto tacks on afterwards is simply discarded), and `cbcNoPadding{En,De}crypt`
 * build unpadded multi-block CBC out of that ECB primitive. General string/stream content, by
 * contrast, genuinely does use padded CBC per spec, so that path calls Web Crypto directly.
 */

const ZERO_IV = new Uint8Array(16);

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i]! ^ b[i]!;
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// pdf-lib's own byte arrays (and slices of them) are typed `Uint8Array<ArrayBufferLike>`,
// which TS's DOM lib no longer accepts as `BufferSource` for Web Crypto calls now that it
// distinguishes ArrayBuffer from SharedArrayBuffer. Every array here is genuinely a plain
// ArrayBuffer at runtime (nothing in this file ever touches a SharedArrayBuffer), so this is a
// type-system correction, not a behavioural cast.
function buf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes as Uint8Array<ArrayBuffer>;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function importAesKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', buf(key.slice()), { name: 'AES-CBC' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** AES-256-ECB of exactly one 16-byte block, derived from CBC-encrypt-with-zero-IV: the first
 * output block of that is ECB(block); Web Crypto's mandatory PKCS#7 padding block that follows
 * it is discarded. */
async function ecbEncryptBlock(key: CryptoKey, block: Uint8Array): Promise<Uint8Array> {
  const out = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv: buf(ZERO_IV) }, key, buf(block)),
  );
  return out.slice(0, 16);
}

/** Unpadded CBC encrypt: `data.length` must be a multiple of 16. Built block-by-block on the
 * ECB primitive rather than Web Crypto's padded CBC, since the output must be exactly
 * `data.length` bytes with no extra padding block. */
async function cbcNoPaddingEncrypt(
  key: CryptoKey,
  iv: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const blocks = data.length / 16;
  const out = new Uint8Array(data.length);
  let previous = iv;
  for (let i = 0; i < blocks; i += 1) {
    const block = data.slice(i * 16, i * 16 + 16);
    const encrypted = await ecbEncryptBlock(key, xorBytes(block, previous));
    out.set(encrypted, i * 16);
    previous = encrypted;
  }
  return out;
}

/** Unpadded CBC decrypt. Web Crypto only exposes padded CBC decrypt (it validates and strips a
 * PKCS#7 block, throwing if the trailing block is not valid padding), so this fabricates a
 * legitimate extra ciphertext block that decrypts to a valid pad block, appends it, and lets
 * Web Crypto do the real chained decryption plus the padding removal. See the file-level
 * comment for why this is a valid substitute for a true ECB-decrypt primitive. */
async function cbcNoPaddingDecrypt(
  key: CryptoKey,
  iv: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const lastBlock = data.length >= 16 ? data.slice(-16) : iv;
  const padBlock = new Uint8Array(16).fill(16);
  const fabricated = await ecbEncryptBlock(key, xorBytes(padBlock, lastBlock));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: buf(iv) },
    key,
    buf(concatBytes(data, fabricated)),
  );
  return new Uint8Array(plain);
}

async function sha(
  bytes: Uint8Array,
  algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512',
): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest(algorithm, buf(bytes)));
}

/**
 * Algorithm 2.B: the password hash revision 6 uses everywhere (validating a password, and
 * deriving the key that wraps the file encryption key). `udata` is empty for the user password
 * and the 48-byte U entry for the owner password.
 */
async function hashR6(
  password: Uint8Array,
  salt: Uint8Array,
  udata: Uint8Array,
): Promise<Uint8Array> {
  let k = await sha(concatBytes(password, salt, udata), 'SHA-256');

  let round = 0;
  for (;;) {
    round += 1;
    const k1 = concatBytes(password, k, udata);
    const repeated = new Uint8Array(k1.length * 64);
    for (let i = 0; i < 64; i += 1) repeated.set(k1, i * k1.length);

    const aesKey = await importAesKey(k.slice(0, 16));
    const e = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: buf(k.slice(16, 32)) },
        aesKey,
        buf(repeated),
      ),
    ).slice(0, repeated.length);

    let sum = 0;
    for (let i = 0; i < 16; i += 1) sum += e[i]!;
    const algorithm = (['SHA-256', 'SHA-384', 'SHA-512'] as const)[sum % 3]!;
    k = await sha(e, algorithm);

    if (round >= 64 && e[e.length - 1]! <= round - 32) break;
  }

  return k.slice(0, 32);
}

export interface PasswordEntries {
  /** 48 bytes: 32-byte hash, 8-byte validation salt, 8-byte key salt. */
  u: Uint8Array;
  /** 32 bytes: the file encryption key, wrapped with a key derived from the user password. */
  ue: Uint8Array;
  o: Uint8Array;
  oe: Uint8Array;
  /** 16 bytes: the permission flags, wrapped so a reader can detect a permissions dictionary
   * that was tampered with independently of the password. */
  perms: Uint8Array;
}

/** Builds the U/UE/O/OE/Perms entries for a fresh file encryption key and a single password
 * used as both the user and owner password — the common case for "lock this PDF with a
 * password", where there is no separate "can open" vs. "can also change permissions" identity. */
export async function computePasswordEntries(
  password: string,
  fileKey: Uint8Array,
  permissions: number,
): Promise<PasswordEntries> {
  const passwordBytes = new TextEncoder().encode(password);

  const uSalts = randomBytes(16);
  const uValidationSalt = uSalts.slice(0, 8);
  const uKeySalt = uSalts.slice(8, 16);
  const uHash = await hashR6(passwordBytes, uValidationSalt, new Uint8Array(0));
  const u = concatBytes(uHash, uValidationSalt, uKeySalt);
  const uIntermediateKey = await hashR6(passwordBytes, uKeySalt, new Uint8Array(0));
  const ue = await cbcNoPaddingEncrypt(await importAesKey(uIntermediateKey), ZERO_IV, fileKey);

  const oSalts = randomBytes(16);
  const oValidationSalt = oSalts.slice(0, 8);
  const oKeySalt = oSalts.slice(8, 16);
  const oHash = await hashR6(passwordBytes, oValidationSalt, u);
  const o = concatBytes(oHash, oValidationSalt, oKeySalt);
  const oIntermediateKey = await hashR6(passwordBytes, oKeySalt, u);
  const oe = await cbcNoPaddingEncrypt(await importAesKey(oIntermediateKey), ZERO_IV, fileKey);

  const permsBlock = new Uint8Array(16);
  new DataView(permsBlock.buffer).setInt32(0, permissions, true);
  permsBlock.set([0xff, 0xff, 0xff, 0xff], 4);
  permsBlock[8] = 'T'.charCodeAt(0); // EncryptMetadata: always true here.
  permsBlock.set([0x61, 0x64, 0x62], 9); // "adb", a fixed marker required by the spec.
  permsBlock.set(randomBytes(4), 12);
  const perms = await ecbEncryptBlock(await importAesKey(fileKey), permsBlock);

  return { u, ue, o, oe, perms };
}

/** Recovers the file encryption key from a password (tried as the user password, then the
 * owner password) and the entries stored in the document's `/Encrypt` dictionary. Throws if
 * neither validates — this is the only path in this module that can reject a password; it
 * never tries anything but the exact string it is given. */
export async function recoverFileKey(
  password: string,
  entries: Pick<PasswordEntries, 'u' | 'ue' | 'o' | 'oe'>,
): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password);

  const uValidationSalt = entries.u.slice(32, 40);
  const uKeySalt = entries.u.slice(40, 48);
  const uCheck = await hashR6(passwordBytes, uValidationSalt, new Uint8Array(0));
  if (bytesToHex(uCheck) === bytesToHex(entries.u.slice(0, 32))) {
    const intermediateKey = await hashR6(passwordBytes, uKeySalt, new Uint8Array(0));
    return cbcNoPaddingDecrypt(await importAesKey(intermediateKey), ZERO_IV, entries.ue);
  }

  const oValidationSalt = entries.o.slice(32, 40);
  const oKeySalt = entries.o.slice(40, 48);
  const oCheck = await hashR6(passwordBytes, oValidationSalt, entries.u);
  if (bytesToHex(oCheck) === bytesToHex(entries.o.slice(0, 32))) {
    const intermediateKey = await hashR6(passwordBytes, oKeySalt, entries.u);
    return cbcNoPaddingDecrypt(await importAesKey(intermediateKey), ZERO_IV, entries.oe);
  }

  throw new Error('wrong_password');
}

/** Encrypts one string or stream's raw bytes: a fresh random 16-byte IV, then padded AES-256-CBC
 * (real PKCS#7 padding, unlike the key-wrapping helpers above), with the IV prepended — the
 * standard convention every PDF crypt filter uses so each unit can be decrypted independently. */
export async function encryptObjectData(
  fileKey: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const iv = randomBytes(16);
  const key = await importAesKey(fileKey);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv: buf(iv) }, key, buf(data)),
  );
  return concatBytes(iv, encrypted);
}

export async function decryptObjectData(
  fileKey: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  if (data.length < 16) return new Uint8Array(0);
  const iv = data.slice(0, 16);
  const key = await importAesKey(fileKey);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: buf(iv) },
    key,
    buf(data.slice(16)),
  );
  return new Uint8Array(plain);
}

/** "Allow everything" permission flags (bit 3 unset would forbid printing, etc.) — reserved
 * bits fixed at 1 per spec, as a signed 32-bit value. Permission *restriction* is honour-system
 * in every PDF reader; only "a password is required to open this file" is a real guarantee. */
export const PERMISSIONS_ALLOW_ALL = -4;
