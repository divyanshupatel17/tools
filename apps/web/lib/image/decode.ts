import { ProcessorError } from '@tools/tool_engine';
import { detectFormat, type ImageFormat } from './image_formats';

export interface DecodedImage {
  /** Always a drawable bitmap, whatever the source format was. */
  bitmap: ImageBitmap;
  width: number;
  height: number;
  format: ImageFormat;
}

const DECODE_FAILED = 'image_decode_failed';

function decodeError(message: string, cause?: unknown): ProcessorError {
  return new ProcessorError(DECODE_FAILED, message, cause !== undefined ? { cause } : undefined);
}

async function bitmapFromImageData(imageData: ImageData): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw decodeError('A drawing surface is not available in this browser.');
  ctx.putImageData(imageData, 0, 0);
  return createImageBitmap(canvas);
}

async function decodeHeic(file: File | Blob): Promise<DecodedImage> {
  try {
    const libheif = await import('libheif-js/wasm-bundle');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoder = new libheif.HeifDecoder();
    const images = decoder.decode(bytes);
    const image = images[0];
    if (!image) throw new Error('No image found inside the HEIC container.');

    const width = image.get_width();
    const height = image.get_height();
    const imageData = new ImageData(width, height);

    await new Promise<void>((resolve, reject) => {
      image.display({ data: imageData.data, width, height }, (result: unknown) => {
        if (!result) reject(new Error('HEIC decoding failed.'));
        else resolve();
      });
    });

    const bitmap = await bitmapFromImageData(imageData);
    return { bitmap, width, height, format: 'heic' };
  } catch (error) {
    throw decodeError(
      'This HEIC file could not be read. It may be corrupted or unsupported.',
      error,
    );
  }
}

async function decodeTiff(file: File | Blob): Promise<DecodedImage> {
  try {
    const UTIF = await import('utif2');
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    const first = ifds[0];
    if (!first) throw new Error('No image found inside the TIFF container.');

    UTIF.decodeImage(buffer, first);
    const rgba = UTIF.toRGBA8(first);
    const imageData = new ImageData(new Uint8ClampedArray(rgba), first.width, first.height);

    const bitmap = await bitmapFromImageData(imageData);
    return { bitmap, width: first.width, height: first.height, format: 'tiff' };
  } catch (error) {
    throw decodeError(
      'This TIFF file could not be read. It may be corrupted or unsupported.',
      error,
    );
  }
}

async function decodeAvif(file: File | Blob): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file);
    return { bitmap, width: bitmap.width, height: bitmap.height, format: 'avif' };
  } catch {
    // Native AVIF decoding is not universally available; fall back to the wasm decoder.
  }

  try {
    const decode = (await import('@jsquash/avif/decode')).default;
    const buffer = await file.arrayBuffer();
    const imageData = await decode(buffer);
    if (!imageData) throw new Error('AVIF decoding returned no image.');
    const bitmap = await bitmapFromImageData(imageData);
    return { bitmap, width: imageData.width, height: imageData.height, format: 'avif' };
  } catch (error) {
    throw decodeError(
      'This AVIF file could not be read. It may be corrupted or unsupported.',
      error,
    );
  }
}

async function decodeSvg(
  file: File | Blob,
  svgSize?: { width: number; height: number },
): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The SVG file could not be loaded.'));
      image.src = url;
    });

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    const width = naturalWidth > 0 ? naturalWidth : svgSize?.width;
    const height = naturalHeight > 0 ? naturalHeight : svgSize?.height;

    if (!width || !height) {
      throw decodeError(
        'This SVG has no width or height set. Provide a target size to rasterise it.',
      );
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw decodeError('A drawing surface is not available in this browser.');
    ctx.drawImage(image, 0, 0, width, height);

    const bitmap = await createImageBitmap(canvas);
    return { bitmap, width, height, format: 'svg' };
  } catch (error) {
    if (error instanceof ProcessorError) throw error;
    throw decodeError('This SVG file could not be read.', error);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Decodes an ICO container: picks the largest embedded image, PNG in ICO decodes directly,
 *  legacy raw DIB icons are reconstructed as a standalone BMP for `createImageBitmap`. */
async function decodeIco(file: File | Blob): Promise<DecodedImage> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint16(4, true);
    if (count === 0) throw new Error('No images found inside the ICO container.');

    let best: {
      width: number;
      height: number;
      bitCount: number;
      bytesInRes: number;
      imageOffset: number;
    } | null = null;

    for (let i = 0; i < count; i += 1) {
      const entryOffset = 6 + i * 16;
      const rawWidth = bytes[entryOffset]!;
      const rawHeight = bytes[entryOffset + 1]!;
      const width = rawWidth === 0 ? 256 : rawWidth;
      const height = rawHeight === 0 ? 256 : rawHeight;
      const bitCount = view.getUint16(entryOffset + 6, true);
      const bytesInRes = view.getUint32(entryOffset + 8, true);
      const imageOffset = view.getUint32(entryOffset + 12, true);

      if (
        !best ||
        width * height > best.width * best.height ||
        (width * height === best.width * best.height && bitCount > best.bitCount)
      ) {
        best = { width, height, bitCount, bytesInRes, imageOffset };
      }
    }
    if (!best) throw new Error('No usable image found inside the ICO container.');

    const slice = bytes.slice(best.imageOffset, best.imageOffset + best.bytesInRes);
    const isPng =
      slice.length >= 4 &&
      slice[0] === 0x89 &&
      slice[1] === 0x50 &&
      slice[2] === 0x4e &&
      slice[3] === 0x47;

    if (isPng) {
      const bitmap = await createImageBitmap(new Blob([slice], { type: 'image/png' }));
      return { bitmap, width: bitmap.width, height: bitmap.height, format: 'ico' };
    }

    // Legacy raw DIB icon (no PNG signature): prepend a BITMAPFILEHEADER so it reads as a
    // standalone BMP. Best effort only — this is an old format, not a hard requirement.
    if (slice.length < 4) throw new Error('The ICO image data is truncated.');
    const dibView = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
    const biSize = dibView.getUint32(0, true);

    const fileHeader = new Uint8Array(14);
    const fileHeaderView = new DataView(fileHeader.buffer);
    fileHeader[0] = 0x42; // 'B'
    fileHeader[1] = 0x4d; // 'M'
    fileHeaderView.setUint32(2, 14 + slice.length, true);
    fileHeaderView.setUint16(6, 0, true);
    fileHeaderView.setUint16(8, 0, true);
    fileHeaderView.setUint32(10, 14 + biSize, true);

    try {
      const bitmap = await createImageBitmap(new Blob([fileHeader, slice], { type: 'image/bmp' }));
      return { bitmap, width: bitmap.width, height: bitmap.height, format: 'ico' };
    } catch (error) {
      throw decodeError(
        'This ICO file uses an older icon format that could not be read. Try a modern ICO exported as PNG.',
        error,
      );
    }
  } catch (error) {
    if (error instanceof ProcessorError) throw error;
    throw decodeError(
      'This ICO file could not be read. It may be corrupted or use an unsupported icon format.',
      error,
    );
  }
}

async function decodeNative(file: File | Blob, format: ImageFormat): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file);
    return { bitmap, width: bitmap.width, height: bitmap.height, format };
  } catch (error) {
    throw decodeError('This image could not be read. It may be corrupted or unsupported.', error);
  }
}

/**
 * Decodes any supported file to a bitmap. Handles HEIC (libheif-js), TIFF (utif2),
 * AVIF (native, falling back to @jsquash/avif) and SVG (rasterised at `svg_size`)
 * as well as everything createImageBitmap already understands.
 * Throws a ProcessorError with a plain message when the file cannot be read.
 */
export async function decodeImage(
  file: File | Blob,
  options?: { svg_size?: { width: number; height: number } },
): Promise<DecodedImage> {
  const format =
    file instanceof File
      ? await detectFormat(file)
      : await detectFormat(new File([file], 'image', { type: file.type }));

  if (!format) {
    throw decodeError('This file is not a recognised image format.');
  }

  switch (format) {
    case 'heic':
      return decodeHeic(file);
    case 'tiff':
      return decodeTiff(file);
    case 'avif':
      return decodeAvif(file);
    case 'svg':
      return decodeSvg(file, options?.svg_size);
    case 'ico':
      // createImageBitmap cannot read an ICO container in any mainstream browser, so this
      // must never fall through to decodeNative.
      return decodeIco(file);
    default:
      return decodeNative(file, format);
  }
}

const IMG_TAG_DISPLAYABLE = new Set<ImageFormat>([
  'jpeg',
  'png',
  'webp',
  'avif',
  'gif',
  'bmp',
  'svg',
]);

/**
 * An object URL safe to hand straight to an `<img>` tag or a PageDetailModal. HEIC and TIFF
 * cannot be painted by the browser's built in image decoder (only Safari's native HEIC codec
 * can, and no mainstream browser decodes TIFF), so those are rasterised to a PNG through
 * decodeImage() first. Every other format is returned as the raw file, unchanged, so this stays
 * as cheap as a plain `URL.createObjectURL` for the common case.
 */
export async function createPreviewUrl(file: File): Promise<string> {
  const format = await detectFormat(file);
  if (format && IMG_TAG_DISPLAYABLE.has(format)) return URL.createObjectURL(file);

  const decoded = await decodeImage(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw decodeError('A drawing surface is not available in this browser.');
    ctx.drawImage(decoded.bitmap, 0, 0);
    return await new Promise<string>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(URL.createObjectURL(blob));
        else reject(decodeError('This image could not be rendered for preview.'));
      }, 'image/png');
    });
  } finally {
    decoded.bitmap.close();
  }
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function sizeFromPng(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
}

function sizeFromGif(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 10) return null;
  return { width: readUint16LE(bytes, 6), height: readUint16LE(bytes, 8) };
}

function sizeFromBmp(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 26) return null;
  return { width: readUint16LE(bytes, 18), height: Math.abs(readUint16LE(bytes, 22)) };
}

function sizeFromJpeg(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      return { height: readUint16BE(bytes, offset + 5), width: readUint16BE(bytes, offset + 7) };
    }
    const segmentLength = readUint16BE(bytes, offset + 2);
    offset += 2 + segmentLength;
  }
  return null;
}

async function sizeFromSvg(file: File): Promise<{ width: number; height: number } | null> {
  const text = await file.text();
  const widthMatch = /width\s*=\s*"([\d.]+)/i.exec(text);
  const heightMatch = /height\s*=\s*"([\d.]+)/i.exec(text);
  if (widthMatch && heightMatch) {
    return { width: parseFloat(widthMatch[1]!), height: parseFloat(heightMatch[1]!) };
  }
  const viewBoxMatch = /viewBox\s*=\s*"[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/i.exec(text);
  if (viewBoxMatch) {
    return { width: parseFloat(viewBoxMatch[1]!), height: parseFloat(viewBoxMatch[2]!) };
  }
  // Browsers fall back to a 300x150 intrinsic size for a sizeless SVG.
  return { width: 300, height: 150 };
}

/** Natural size without paying to decode the pixels where the format allows it. */
export async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  const format = await detectFormat(file);
  if (!format) throw decodeError('This file is not a recognised image format.');

  const head = new Uint8Array(await file.slice(0, 65536).arrayBuffer());

  if (format === 'png') {
    const size = sizeFromPng(head);
    if (size) return size;
  } else if (format === 'gif') {
    const size = sizeFromGif(head);
    if (size) return size;
  } else if (format === 'bmp') {
    const size = sizeFromBmp(head);
    if (size) return size;
  } else if (format === 'jpeg') {
    const size = sizeFromJpeg(head);
    if (size) return size;
  } else if (format === 'svg') {
    const size = await sizeFromSvg(file);
    if (size) return size;
  }

  // Anything else (webp, avif, heic, tiff, or a header we could not parse) pays for a full decode.
  const decoded = await decodeImage(file);
  const size = { width: decoded.width, height: decoded.height };
  decoded.bitmap.close();
  return size;
}
