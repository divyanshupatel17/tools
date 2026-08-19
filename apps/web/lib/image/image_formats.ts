import type { FileRule } from '@tools/file_utils';

/** Every format the shared decoder understands, whether or not we can write it back out. */
export type ImageFormat =
  'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'bmp' | 'tiff' | 'heic' | 'svg' | 'ico';

/** Formats every image tool's quality focused output picker offers (compress, crop, resize
 *  results, and the default choices inside Convert Image). */
export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif';

export const OUTPUT_FORMATS: readonly OutputFormat[] = ['jpeg', 'png', 'webp', 'avif'];

/** Every format Convert Image can write, including the four above. GIF, BMP, TIFF and ICO are
 *  encoded by hand in `encode.ts` (no browser API writes them), so they are kept out of the
 *  narrower `OUTPUT_FORMATS` other tools use — a compress or crop result has no reason to offer
 *  an uncompressed BMP or a multi hundred kilobyte TIFF. */
export type ConvertOutputFormat = OutputFormat | 'gif' | 'bmp' | 'tiff' | 'ico';

export const CONVERT_OUTPUT_FORMATS: readonly ConvertOutputFormat[] = [
  'jpeg',
  'png',
  'webp',
  'avif',
  'gif',
  'bmp',
  'tiff',
  'ico',
];

export const IMAGE_MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  heic: 'image/heic',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

export const IMAGE_EXTENSION: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  gif: 'gif',
  bmp: 'bmp',
  tiff: 'tiff',
  heic: 'heic',
  svg: 'svg',
  ico: 'ico',
};

/** Human label for a control panel: 'JPG', 'PNG', 'WebP', 'AVIF', ... */
export const IMAGE_LABEL: Record<ImageFormat, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  avif: 'AVIF',
  gif: 'GIF',
  bmp: 'BMP',
  tiff: 'TIFF',
  heic: 'HEIC',
  svg: 'SVG',
  ico: 'ICO',
};

const ALPHA_FORMATS = new Set<ImageFormat>([
  'png',
  'webp',
  'avif',
  'gif',
  'bmp',
  'tiff',
  'heic',
  'svg',
  'ico',
]);
const LOSSY_FORMATS = new Set<ImageFormat>(['jpeg', 'webp', 'avif', 'heic']);

/** True when the format keeps an alpha channel. JPG does not. */
export function supportsAlpha(format: ImageFormat): boolean {
  return ALPHA_FORMATS.has(format);
}

/** True when quality is meaningful. PNG is lossless, so its slider is hidden. */
export function isLossy(format: ImageFormat): boolean {
  return LOSSY_FORMATS.has(format);
}

const EXTENSION_TO_FORMAT: Record<string, ImageFormat> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  jfif: 'jpeg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  gif: 'gif',
  bmp: 'bmp',
  tif: 'tiff',
  tiff: 'tiff',
  heic: 'heic',
  heif: 'heic',
  svg: 'svg',
  ico: 'ico',
};

const MIME_TO_FORMAT: Record<string, ImageFormat> = {
  'image/jpeg': 'jpeg',
  'image/pjpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

/** Magic byte signatures long enough to disambiguate the formats we support. */
const SIGNATURES: { format: ImageFormat; offset: number; bytes: number[] }[] = [
  { format: 'png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { format: 'jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { format: 'gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { format: 'bmp', offset: 0, bytes: [0x42, 0x4d] },
  { format: 'tiff', offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { format: 'tiff', offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { format: 'ico', offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] },
];

function matchesSignature(
  bytes: Uint8Array,
  signature: { offset: number; bytes: number[] },
): boolean {
  if (bytes.length < signature.offset + signature.bytes.length) return false;
  return signature.bytes.every((value, index) => bytes[signature.offset + index] === value);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length && offset + i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[offset + i]!);
  }
  return out;
}

/** Cheap synchronous guess from MIME type and extension only. */
export function guessFormat(file: File): ImageFormat | null {
  const mimeMatch = MIME_TO_FORMAT[file.type.toLowerCase()];
  if (mimeMatch) return mimeMatch;

  const dot = file.name.lastIndexOf('.');
  const extension = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  return EXTENSION_TO_FORMAT[extension] ?? null;
}

/** Sniffs the real format from the file's magic bytes, falling back to type and extension. */
export async function detectFormat(file: File): Promise<ImageFormat | null> {
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());

  for (const signature of SIGNATURES) {
    if (matchesSignature(head, signature)) return signature.format;
  }

  // WebP: 'RIFF' .... 'WEBP'
  if (readAscii(head, 0, 4) === 'RIFF' && readAscii(head, 8, 4) === 'WEBP') return 'webp';

  // AVIF and HEIC both live inside an ISO BMFF container: bytes 4 to 8 are 'ftyp',
  // followed by a brand that tells them apart.
  if (readAscii(head, 4, 4) === 'ftyp') {
    const brand = readAscii(head, 8, 4);
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'avif';
    if (
      brand.startsWith('heic') ||
      brand.startsWith('heix') ||
      brand.startsWith('hei') ||
      brand.startsWith('mif1')
    ) {
      return 'heic';
    }
  }

  // SVG is text, so sniff for the opening tag rather than magic bytes.
  const text = readAscii(head, 0, 32).trim();
  if (text.startsWith('<?xml') || text.startsWith('<svg')) return 'svg';

  return guessFormat(file);
}

/** `accept` string for a file input covering everything we can decode. */
export const IMAGE_ACCEPT =
  '.jpg,.jpeg,.png,.webp,.avif,.gif,.bmp,.tif,.tiff,.heic,.heif,.svg,.ico,image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp,image/tiff,image/heic,image/heif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon';

/** Builds a FileRule for @tools/file_utils covering everything we can decode. */
export function imageRule(options?: { max_files?: number; max_bytes?: number }): FileRule {
  return {
    mime_types: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/heic',
      'image/heif',
      'image/svg+xml',
      'image/x-icon',
      'image/vnd.microsoft.icon',
    ],
    extensions: [
      'jpg',
      'jpeg',
      'png',
      'webp',
      'avif',
      'gif',
      'bmp',
      'tif',
      'tiff',
      'heic',
      'heif',
      'svg',
      'ico',
    ],
    max_files: options?.max_files,
    max_bytes: options?.max_bytes,
  };
}
