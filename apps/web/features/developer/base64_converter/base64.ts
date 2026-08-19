const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

/** A loose heuristic for the input badge: base64 text is length divisible by 4, charset limited,
 * and long enough that a short word like "Hi" typed while decoding isn't mistaken for base64. */
export function looksLikeBase64(text: string): boolean {
  const trimmed = text.trim().replace(/\s+/g, '');
  if (trimmed === '' || trimmed.length % 4 !== 0) return false;
  return BASE64_PATTERN.test(trimmed);
}

export function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function encodeTextToBase64(text: string): string {
  return encodeBytesToBase64(new TextEncoder().encode(text));
}

export interface DecodeSuccess {
  ok: true;
  bytes: Uint8Array;
  /** Set only when the decoded bytes are valid UTF-8, since binary output has nothing to show. */
  text: string | null;
}

export interface DecodeFailure {
  ok: false;
  message: string;
}

export type DecodeResult = DecodeSuccess | DecodeFailure;

export function decodeBase64(source: string): DecodeResult {
  const trimmed = source.trim().replace(/\s+/g, '');
  if (trimmed === '') {
    return { ok: false, message: 'There is nothing to decode yet.' };
  }
  let binary: string;
  try {
    binary = atob(trimmed);
  } catch {
    return { ok: false, message: 'That is not valid Base64. Check for stray characters or padding.' };
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  let text: string | null;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = null;
  }
  return { ok: true, bytes, text };
}
