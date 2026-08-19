export function encodeUrlText(text: string): string {
  return encodeURIComponent(text);
}

export interface UrlDecodeSuccess {
  ok: true;
  text: string;
}
export interface UrlDecodeFailure {
  ok: false;
  message: string;
}
export type UrlDecodeResult = UrlDecodeSuccess | UrlDecodeFailure;

export function decodeUrlText(text: string): UrlDecodeResult {
  try {
    return { ok: true, text: decodeURIComponent(text) };
  } catch {
    return { ok: false, message: 'That is not valid percent encoding. Check for a stray % sign.' };
  }
}
