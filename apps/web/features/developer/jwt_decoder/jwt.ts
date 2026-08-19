export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  headerRaw: string;
  payloadRaw: string;
}

export interface DecodeJwtSuccess {
  ok: true;
  jwt: DecodedJwt;
}

export interface DecodeJwtFailure {
  ok: false;
  message: string;
}

export type DecodeJwtResult = DecodeJwtSuccess | DecodeJwtFailure;

function base64UrlDecode(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodeJwt(token: string): DecodeJwtResult {
  const trimmed = token.trim();
  if (trimmed === '') {
    return { ok: false, message: 'Paste a JWT token to decode.' };
  }

  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return { ok: false, message: 'That is not a valid JWT. It needs three parts separated by periods.' };
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  try {
    const headerRaw = base64UrlDecode(headerSegment);
    const payloadRaw = base64UrlDecode(payloadSegment);
    const header = JSON.parse(headerRaw) as Record<string, unknown>;
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    return {
      ok: true,
      jwt: { header, payload, signature: signatureSegment, headerRaw, payloadRaw },
    };
  } catch {
    return {
      ok: false,
      message: 'That token could not be decoded. Check it is valid Base64Url encoded JSON.',
    };
  }
}

export function formatClaimTimestamp(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function formatClaimText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  return JSON.stringify(value);
}
