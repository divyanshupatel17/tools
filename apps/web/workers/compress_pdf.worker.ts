/// <reference lib="webworker" />
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  type PDFRef,
} from 'pdf-lib';

export type CompressLevel = 'low' | 'medium' | 'high';

export interface CompressRequest {
  source: ArrayBuffer;
  /** JPEG re-encode quality, 0 to 1. Passed straight to `canvas.convertToBlob`. */
  quality: number;
}

export type CompressResponse =
  | { type: 'progress'; ratio: number }
  | { type: 'done'; bytes: ArrayBuffer; images_recompressed: number; images_total: number }
  | { type: 'error'; message: string };

/** Reference points kept from the old three-step presets: the longest edge a photo is
 * downsampled to at the extremes of the quality range. A low quality choice is for a
 * scanned document going by email, not an archive copy, so it is allowed to downsample
 * further than a high quality choice. */
const PRESETS: Record<CompressLevel, { quality: number; maxDimension: number }> = {
  low: { quality: 0.82, maxDimension: 2200 },
  medium: { quality: 0.65, maxDimension: 1600 },
  high: { quality: 0.45, maxDimension: 1200 },
};

const MIN_DIMENSION = PRESETS.high.maxDimension;
const MAX_DIMENSION = PRESETS.low.maxDimension;

/** Replaces the old fixed three-step jump: the resize target now slides linearly with the
 * quality value, so a small slider move never causes a sudden resolution cliff. */
function maxDimensionForQuality(quality: number): number {
  const clamped = Math.min(1, Math.max(0, quality));
  return Math.round(MIN_DIMENSION + clamped * (MAX_DIMENSION - MIN_DIMENSION));
}

const post = (message: CompressResponse, transfer?: Transferable[]) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer ?? []);

/**
 * Recompressing every embedded raster correctly requires decoding its colour space (DeviceGray,
 * CMYK, Indexed, ICC-based...), and a soft mask's own image object is required by spec to carry
 * `ColorSpace /DeviceGray`. Re-encoding as a browser JPEG always produces DeviceRGB output, so
 * touching anything but a plain 8-bit DeviceRGB JPEG would corrupt the colours or break a mask.
 * Restricting to that one, extremely common case (a photo or scanned page) keeps every rewrite
 * provably safe instead of merely "usually fine".
 */
function isRecompressibleJpeg(dict: PDFDict): boolean {
  const subtype = dict.lookup(PDFName.of('Subtype'));
  if (subtype !== PDFName.of('Image')) return false;

  const filter = dict.lookup(PDFName.of('Filter'));
  const filterName =
    filter instanceof PDFName
      ? filter
      : filter instanceof PDFArray && filter.size() === 1
        ? filter.lookup(0, PDFName)
        : undefined;
  if (filterName !== PDFName.of('DCTDecode')) return false;

  if (dict.lookup(PDFName.of('ColorSpace')) !== PDFName.of('DeviceRGB')) return false;

  const bitsPerComponent = dict.lookup(PDFName.of('BitsPerComponent'));
  if (!(bitsPerComponent instanceof PDFNumber) || bitsPerComponent.asNumber() !== 8) return false;

  return true;
}

async function recompressJpeg(
  bytes: Uint8Array,
  maxDimension: number,
  quality: number,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  // Stream contents from pdf-lib are typed as Uint8Array<ArrayBufferLike>: copy into a plain
  // ArrayBuffer-backed view so it satisfies BlobPart.
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);

    const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    const outBytes = new Uint8Array(await outBlob.arrayBuffer()) as Uint8Array<ArrayBuffer>;

    // A recompression that grew the image (rare, on already-tiny thumbnails) is not worth keeping.
    if (outBytes.length >= bytes.length) return null;
    return { bytes: outBytes, width, height };
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (event: MessageEvent<CompressRequest>) => {
  const { source, quality } = event.data;
  const maxDimension = maxDimensionForQuality(quality);

  try {
    const pdfDoc = await PDFDocument.load(source, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const context = pdfDoc.context;

    const images = context
      .enumerateIndirectObjects()
      .filter(
        (entry): entry is [PDFRef, PDFRawStream] =>
          entry[1] instanceof PDFRawStream && isRecompressibleJpeg(entry[1].dict),
      );

    post({ type: 'progress', ratio: 0.05 });

    let recompressed = 0;
    for (let index = 0; index < images.length; index += 1) {
      const entry = images[index];
      if (!entry) continue;
      const [ref, stream] = entry;

      try {
        const next = await recompressJpeg(stream.getContents(), maxDimension, quality);
        if (next) {
          const dict = stream.dict;
          dict.set(PDFName.of('Width'), PDFNumber.of(next.width));
          dict.set(PDFName.of('Height'), PDFNumber.of(next.height));
          dict.set(PDFName.of('Length'), PDFNumber.of(next.bytes.length));
          dict.delete(PDFName.of('DecodeParms'));
          context.assign(ref, PDFRawStream.of(dict, next.bytes));
          recompressed += 1;
        }
      } catch {
        // A JPEG variant the browser's decoder won't touch (progressive edge cases, CMYK
        // mislabelled as RGB, ...) — leave that one image exactly as it was.
      }

      post({ type: 'progress', ratio: 0.05 + 0.85 * ((index + 1) / Math.max(1, images.length)) });
    }

    const bytes = await pdfDoc.save({ useObjectStreams: true });
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    post({ type: 'progress', ratio: 1 });
    post(
      {
        type: 'done',
        bytes: buffer,
        images_recompressed: recompressed,
        images_total: images.length,
      },
      [buffer],
    );
  } catch (error) {
    post({
      type: 'error',
      message: error instanceof Error ? error.message : 'The document could not be compressed.',
    });
  }
};
