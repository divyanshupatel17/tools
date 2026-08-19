import { ProcessorError } from '@tools/tool_engine';
import { createCanvas } from './canvas';
import { IMAGE_MIME, isLossy, supportsAlpha, type ConvertOutputFormat } from './image_formats';

export interface EncodeOptions {
  format: ConvertOutputFormat;
  /** 0 to 1. Ignored for PNG. Defaults to 0.82. */
  quality?: number;
  /** Fills transparency before encoding to a format without alpha. Defaults to '#ffffff'. */
  background?: string;
}

const DEFAULT_QUALITY = 0.82;
const TARGET_SIZE_ITERATIONS = 7;

function get2dContext(
  source: HTMLCanvasElement | OffscreenCanvas,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = source.getContext('2d');
  if (!ctx)
    throw new ProcessorError(
      'image_canvas_unavailable',
      'A drawing surface is not available in this browser.',
    );
  return ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

/** Paints a background under a source that may have transparency, regardless of canvas kind. */
function flattenAny(
  source: HTMLCanvasElement | OffscreenCanvas,
  background: string,
): HTMLCanvasElement {
  const result = createCanvas(source.width, source.height);
  result.ctx.fillStyle = background;
  result.ctx.fillRect(0, 0, source.width, source.height);
  result.ctx.drawImage(source as CanvasImageSource, 0, 0);
  return result.canvas;
}

async function encodeAvif(
  source: HTMLCanvasElement | OffscreenCanvas,
  quality: number,
): Promise<Blob> {
  if (source.width <= 0 || source.height <= 0) {
    throw new ProcessorError('image_encode_empty', 'The image has no pixels to encode.');
  }
  const ctx = get2dContext(source);
  const imageData = ctx.getImageData(0, 0, source.width, source.height);
  try {
    const encode = (await import('@jsquash/avif/encode')).default;
    const buffer = await encode(imageData, { quality: Math.round(quality * 100) });
    return new Blob([buffer], { type: 'image/avif' });
  } catch (error) {
    throw new ProcessorError(
      'image_encode_avif_failed',
      'AVIF encoding is not supported in this browser.',
      {
        cause: error,
      },
    );
  }
}

/** Uncompressed 32bpp BGRA BMP, bottom up row order. */
async function encodeBmp(source: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if (source.width <= 0 || source.height <= 0) {
    throw new ProcessorError('image_encode_empty', 'The image has no pixels to encode.');
  }
  const ctx = get2dContext(source);
  const { width, height, data } = ctx.getImageData(0, 0, source.width, source.height);

  const pixelDataSize = width * height * 4;
  const fileSize = 54 + pixelDataSize;
  const bytes = new Uint8Array(fileSize);
  const view = new DataView(bytes.buffer);

  // BITMAPFILEHEADER
  bytes[0] = 0x42; // 'B'
  bytes[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint32(10, 54, true);

  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive height = bottom up row order
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 32, true); // bitcount
  view.setUint32(30, 0, true); // BI_RGB
  view.setUint32(34, 0, true); // image size (0 is valid for BI_RGB)
  view.setUint32(38, 0, true);
  view.setUint32(42, 0, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  let offset = 54;
  for (let row = height - 1; row >= 0; row -= 1) {
    let srcIndex = row * width * 4;
    for (let col = 0; col < width; col += 1) {
      bytes[offset] = data[srcIndex + 2]!; // B
      bytes[offset + 1] = data[srcIndex + 1]!; // G
      bytes[offset + 2] = data[srcIndex]!; // R
      bytes[offset + 3] = data[srcIndex + 3]!; // A
      offset += 4;
      srcIndex += 4;
    }
  }

  return new Blob([bytes], { type: 'image/bmp' });
}

/** Wraps a PNG encoded copy of the image in a minimal single image ICO container. */
async function encodeIco(source: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  const pngBlob = await encodeBlob(source, 'image/png', 1);
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

  const clampDimension = (value: number): number => (value >= 256 ? 0 : Math.min(value, 255));

  const headerSize = 6 + 16;
  const bytes = new Uint8Array(headerSize + pngBytes.length);
  const view = new DataView(bytes.buffer);

  // ICONDIR
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, 1, true); // image count

  // ICONDIRENTRY
  bytes[6] = clampDimension(source.width);
  bytes[7] = clampDimension(source.height);
  bytes[8] = 0; // color count (0 = no palette)
  bytes[9] = 0; // reserved
  view.setUint16(10, 1, true); // color planes
  view.setUint16(12, 32, true); // bits per pixel
  view.setUint32(14, pngBytes.length, true); // bytes in resource
  view.setUint32(18, headerSize, true); // image data offset

  bytes.set(pngBytes, headerSize);

  return new Blob([bytes], { type: 'image/x-icon' });
}

/** Baseline uncompressed RGBA TIFF, little endian, single strip, no compression. */
async function encodeTiff(source: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if (source.width <= 0 || source.height <= 0) {
    throw new ProcessorError('image_encode_empty', 'The image has no pixels to encode.');
  }
  const ctx = get2dContext(source);
  const { width, height, data } = ctx.getImageData(0, 0, source.width, source.height);

  const entryCount = 13;
  const ifdOffset = 8;
  const entriesOffset = ifdOffset + 2;
  const nextIfdOffset = entriesOffset + entryCount * 12;
  const bitsPerSampleOffset = nextIfdOffset + 4;
  const xResolutionOffset = bitsPerSampleOffset + 8;
  const yResolutionOffset = xResolutionOffset + 8;
  const pixelDataOffset = yResolutionOffset + 8;
  const pixelDataSize = width * height * 4;
  const totalSize = pixelDataOffset + pixelDataSize;

  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);

  // Header: 'II', magic 42, offset to first IFD
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  view.setUint16(ifdOffset, entryCount, true);

  const entries: { tag: number; type: number; count: number; value: number }[] = [
    { tag: 256, type: 4, count: 1, value: width }, // ImageWidth
    { tag: 257, type: 4, count: 1, value: height }, // ImageLength
    { tag: 258, type: 3, count: 4, value: bitsPerSampleOffset }, // BitsPerSample
    { tag: 259, type: 3, count: 1, value: 1 }, // Compression: none
    { tag: 262, type: 3, count: 1, value: 2 }, // PhotometricInterpretation: RGB
    { tag: 273, type: 4, count: 1, value: pixelDataOffset }, // StripOffsets
    { tag: 277, type: 3, count: 1, value: 4 }, // SamplesPerPixel
    { tag: 278, type: 4, count: 1, value: height }, // RowsPerStrip
    { tag: 279, type: 4, count: 1, value: pixelDataSize }, // StripByteCounts
    { tag: 282, type: 5, count: 1, value: xResolutionOffset }, // XResolution
    { tag: 283, type: 5, count: 1, value: yResolutionOffset }, // YResolution
    { tag: 296, type: 3, count: 1, value: 2 }, // ResolutionUnit: inches
    { tag: 338, type: 3, count: 1, value: 2 }, // ExtraSamples: unassociated alpha
  ];

  let entryOffset = entriesOffset;
  for (const entry of entries) {
    view.setUint16(entryOffset, entry.tag, true);
    view.setUint16(entryOffset + 2, entry.type, true);
    view.setUint32(entryOffset + 4, entry.count, true);
    view.setUint32(entryOffset + 8, entry.value, true);
    entryOffset += 12;
  }

  view.setUint32(nextIfdOffset, 0, true); // no next IFD

  // BitsPerSample array: 8,8,8,8
  view.setUint16(bitsPerSampleOffset, 8, true);
  view.setUint16(bitsPerSampleOffset + 2, 8, true);
  view.setUint16(bitsPerSampleOffset + 4, 8, true);
  view.setUint16(bitsPerSampleOffset + 6, 8, true);

  // XResolution / YResolution: 72/1
  view.setUint32(xResolutionOffset, 72, true);
  view.setUint32(xResolutionOffset + 4, 1, true);
  view.setUint32(yResolutionOffset, 72, true);
  view.setUint32(yResolutionOffset + 4, 1, true);

  bytes.set(data, pixelDataOffset);

  return new Blob([bytes], { type: 'image/tiff' });
}

type RgbColor = [number, number, number];

/** Standard median cut: recursively splits along the largest range channel until `maxColors`
 *  buckets exist, then averages each bucket's colors into the final palette entry. */
function medianCutPalette(colors: RgbColor[], maxColors: number): RgbColor[] {
  if (colors.length === 0) return [[0, 0, 0]];

  const buckets: RgbColor[][] = [colors];

  while (buckets.length < maxColors) {
    let targetIndex = -1;
    let targetChannel = 0;
    let targetRange = 0;

    for (let i = 0; i < buckets.length; i += 1) {
      const bucket = buckets[i]!;
      if (bucket.length <= 1) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        let min = 255;
        let max = 0;
        for (const color of bucket) {
          const value = color[channel]!;
          if (value < min) min = value;
          if (value > max) max = value;
        }
        const range = max - min;
        if (range > targetRange) {
          targetRange = range;
          targetIndex = i;
          targetChannel = channel;
        }
      }
    }

    if (targetIndex === -1 || targetRange <= 0) break;

    const bucket = buckets[targetIndex]!;
    bucket.sort((a, b) => a[targetChannel]! - b[targetChannel]!);
    const mid = Math.floor(bucket.length / 2);
    const left = bucket.slice(0, mid);
    const right = bucket.slice(mid);
    buckets.splice(targetIndex, 1, left, right);
  }

  return buckets.map((bucket) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const color of bucket) {
      r += color[0];
      g += color[1];
      b += color[2];
    }
    const n = bucket.length;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

const GIF_SAMPLE_CAP = 20000;

/** Quantizes an ImageData to at most 256 colors and returns per pixel palette indices. Alpha
 *  is treated as simple binary transparency: >=128 is opaque, <128 maps to a reserved index. */
function buildGifPalette(imageData: ImageData): {
  palette: RgbColor[];
  indices: Uint8Array;
  transparentIndex: number;
} {
  const { width, height, data } = imageData;
  const pixelCount = width * height;

  let hasTransparency = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! < 128) {
      hasTransparency = true;
      break;
    }
  }

  const maxColors = hasTransparency ? 255 : 256;
  const stride = pixelCount > GIF_SAMPLE_CAP ? Math.ceil(pixelCount / GIF_SAMPLE_CAP) : 1;

  const sampleColors: RgbColor[] = [];
  for (let p = 0; p < pixelCount; p += stride) {
    const idx = p * 4;
    if (data[idx + 3]! < 128) continue;
    sampleColors.push([data[idx]!, data[idx + 1]!, data[idx + 2]!]);
  }
  if (sampleColors.length === 0) sampleColors.push([0, 0, 0]);

  const basePalette = medianCutPalette(sampleColors, maxColors);
  const transparentIndex = hasTransparency ? basePalette.length : -1;
  const palette = hasTransparency ? [...basePalette, [0, 0, 0] as RgbColor] : basePalette;

  const indices = new Uint8Array(pixelCount);
  const nearestCache = new Map<number, number>();

  for (let p = 0; p < pixelCount; p += 1) {
    const idx = p * 4;
    if (hasTransparency && data[idx + 3]! < 128) {
      indices[p] = transparentIndex;
      continue;
    }

    const r = data[idx]!;
    const g = data[idx + 1]!;
    const b = data[idx + 2]!;
    const key = (r << 16) | (g << 8) | b;
    let best = nearestCache.get(key);
    if (best === undefined) {
      best = 0;
      let bestDist = Infinity;
      for (let ci = 0; ci < palette.length; ci += 1) {
        if (ci === transparentIndex) continue;
        const color = palette[ci]!;
        const dr = r - color[0];
        const dg = g - color[1];
        const db = b - color[2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          best = ci;
        }
      }
      nearestCache.set(key, best);
    }
    indices[p] = best;
  }

  return { palette, indices, transparentIndex };
}

/** Classic dictionary based GIF LZW: variable code size starting at `minCodeSize + 1`, growing
 *  by 1 bit whenever the dictionary fills, resetting with a clear code at 12 bits. Returns the
 *  raw code stream packed LSB first into bytes, before GIF's sub-block splitting. */
function lzwEncodeGif(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  let dict = new Map<string, number>();

  const resetDict = (): void => {
    dict = new Map<string, number>();
    for (let i = 0; i < clearCode; i += 1) dict.set(String(i), i);
    nextCode = endCode + 1;
    codeSize = minCodeSize + 1;
  };
  resetDict();

  const bytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const emit = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);

  if (indices.length > 0) {
    let prefix = String(indices[0]);
    for (let i = 1; i < indices.length; i += 1) {
      const k = indices[i];
      const combined = `${prefix},${k}`;
      if (dict.has(combined)) {
        prefix = combined;
        continue;
      }

      emit(dict.get(prefix)!);

      if (nextCode < 4096) {
        dict.set(combined, nextCode);
        nextCode += 1;
        if (nextCode >= 1 << codeSize && codeSize < 12) codeSize += 1;
      } else {
        emit(clearCode);
        resetDict();
      }

      prefix = String(k);
    }
    emit(dict.get(prefix)!);
  }

  emit(endCode);
  if (bitCount > 0) bytes.push(bitBuffer & 0xff);

  return bytes;
}

/** Splits an LZW code stream into GIF sub-blocks: a length byte (max 255) followed by that many
 *  data bytes, terminated by a zero length block. */
function blockSplitGifData(data: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const chunkSize = Math.min(255, data.length - i);
    out.push(chunkSize);
    for (let j = 0; j < chunkSize; j += 1) out.push(data[i + j]!);
    i += chunkSize;
  }
  out.push(0);
  return out;
}

/** Single frame GIF89a with a global color table, hand rolled median cut quantization and LZW
 *  compression (no browser API writes GIF). Alpha becomes simple binary transparency. */
async function encodeGif(source: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if (source.width <= 0 || source.height <= 0) {
    throw new ProcessorError('image_encode_empty', 'The image has no pixels to encode.');
  }
  const ctx = get2dContext(source);
  const imageData = ctx.getImageData(0, 0, source.width, source.height);
  const { width, height } = imageData;

  const { palette, indices, transparentIndex } = buildGifPalette(imageData);
  const paletteSize = palette.length;
  const paletteBits = Math.max(1, Math.ceil(Math.log2(paletteSize)));
  const tableSize = 1 << paletteBits;
  const minCodeSize = Math.max(2, Math.ceil(Math.log2(paletteSize)));

  const lzwData = lzwEncodeGif(indices, minCodeSize);
  const blockData = blockSplitGifData(lzwData);

  const header: number[] = [];
  const pushAscii = (s: string): void => {
    for (let i = 0; i < s.length; i += 1) header.push(s.charCodeAt(i));
  };
  const pushU16 = (v: number): void => {
    header.push(v & 0xff, (v >> 8) & 0xff);
  };

  pushAscii('GIF89a');
  pushU16(width);
  pushU16(height);
  header.push(0x80 | ((paletteBits - 1) << 4) | (paletteBits - 1)); // packed LSD
  header.push(0); // background color index
  header.push(0); // pixel aspect ratio

  for (let i = 0; i < tableSize; i += 1) {
    const color = palette[i] ?? [0, 0, 0];
    header.push(color[0], color[1], color[2]);
  }

  if (transparentIndex >= 0) {
    header.push(0x21, 0xf9, 0x04); // Graphic Control Extension
    header.push(0x01); // transparent color flag
    pushU16(0); // delay time
    header.push(transparentIndex);
    header.push(0x00);
  }

  header.push(0x2c); // Image Descriptor
  pushU16(0);
  pushU16(0);
  pushU16(width);
  pushU16(height);
  header.push(0x00);

  const parts: BlobPart[] = [
    Uint8Array.from(header),
    Uint8Array.from([minCodeSize]),
    Uint8Array.from(blockData),
    Uint8Array.from([0x3b]), // trailer
  ];

  return new Blob(parts, { type: 'image/gif' });
}

async function encodeBlob(
  source: HTMLCanvasElement | OffscreenCanvas,
  mime: string,
  quality: number,
): Promise<Blob> {
  if (source.width <= 0 || source.height <= 0) {
    throw new ProcessorError('image_encode_empty', 'The image has no pixels to encode.');
  }
  if ('convertToBlob' in source) {
    return await (source as OffscreenCanvas).convertToBlob({ type: mime, quality });
  }
  return await new Promise<Blob>((resolve, reject) => {
    (source as HTMLCanvasElement).toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new ProcessorError('image_encode_failed', 'The image could not be encoded.'));
      },
      mime,
      quality,
    );
  });
}

/** Encodes a canvas. AVIF goes through @jsquash/avif; the rest through the canvas API. */
export async function encodeCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: EncodeOptions,
): Promise<Blob> {
  const quality = options.quality ?? DEFAULT_QUALITY;
  const source = supportsAlpha(options.format)
    ? canvas
    : flattenAny(canvas, options.background ?? '#ffffff');

  if (options.format === 'avif') return encodeAvif(source, quality);
  if (options.format === 'bmp') return encodeBmp(source);
  if (options.format === 'gif') return encodeGif(source);
  if (options.format === 'tiff') return encodeTiff(source);
  if (options.format === 'ico') return encodeIco(source);
  return encodeBlob(source, IMAGE_MIME[options.format], quality);
}

/**
 * Binary searches quality to land at or under `target_bytes`, returning the best result it
 * found. Honours `signal`. Never claims success it did not achieve: `hit_target` says whether
 * the target was actually reached.
 */
export async function encodeToTargetSize(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: Omit<EncodeOptions, 'quality'> & { target_bytes: number },
  context?: { signal?: AbortSignal; on_progress?: (ratio: number) => void },
): Promise<{ blob: Blob; quality: number; hit_target: boolean }> {
  const { target_bytes, ...encodeOptions } = options;

  // PNG (and any future lossless format) ignores the quality argument entirely, so
  // searching across quality values would just re-encode the same bytes seven times.
  if (!isLossy(encodeOptions.format)) {
    const blob = await encodeCanvas(canvas, { ...encodeOptions, quality: 1 });
    context?.on_progress?.(1);
    return { blob, quality: 1, hit_target: blob.size <= target_bytes };
  }

  let low = 0.02;
  let high = 1;
  let best: { blob: Blob; quality: number } | null = null;
  let smallest: { blob: Blob; quality: number } | null = null;

  for (let i = 0; i < TARGET_SIZE_ITERATIONS; i += 1) {
    if (context?.signal?.aborted) break;

    const quality = i === 0 ? high : (low + high) / 2;
    const blob = await encodeCanvas(canvas, { ...encodeOptions, quality });
    context?.on_progress?.((i + 1) / TARGET_SIZE_ITERATIONS);

    if (!smallest || blob.size < smallest.blob.size) smallest = { blob, quality };

    if (blob.size <= target_bytes) {
      best = { blob, quality };
      low = quality;
    } else {
      high = quality;
    }
  }

  if (best) return { blob: best.blob, quality: best.quality, hit_target: true };

  const fallback = smallest ?? {
    blob: await encodeCanvas(canvas, { ...encodeOptions, quality: low }),
    quality: low,
  };
  return { blob: fallback.blob, quality: fallback.quality, hit_target: false };
}

function probeCanvasEncode(mime: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      canvas.toBlob((blob) => resolve(!!blob && blob.type === mime), mime);
    } catch {
      resolve(false);
    }
  });
}

async function probeAvifEncode(): Promise<boolean> {
  const native = await probeCanvasEncode('image/avif');
  if (native) return true;
  try {
    const encode = (await import('@jsquash/avif/encode')).default;
    const buffer = await encode(new ImageData(1, 1), { quality: 50 });
    return buffer.byteLength > 0;
  } catch {
    return false;
  }
}

const encodeSupportCache = new Map<ConvertOutputFormat, Promise<boolean>>();
const HAND_ROLLED_FORMATS = new Set<ConvertOutputFormat>(['bmp', 'gif', 'tiff', 'ico']);

/** Cached feature probe. Used to hide an option rather than fail after the click. Formats we
 *  hand roll ourselves (bmp, gif, tiff, ico) need no probing: they have no browser dependency. */
export function canEncode(format: ConvertOutputFormat): Promise<boolean> {
  if (HAND_ROLLED_FORMATS.has(format)) return Promise.resolve(true);

  let cached = encodeSupportCache.get(format);
  if (!cached) {
    cached = format === 'avif' ? probeAvifEncode() : probeCanvasEncode(IMAGE_MIME[format]);
    encodeSupportCache.set(format, cached);
  }
  return cached;
}
