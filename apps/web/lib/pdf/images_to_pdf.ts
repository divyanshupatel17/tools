'use client';

export type ImagesToPdfPageSize = 'fit' | 'a4' | 'letter';
export type ImagesToPdfOrientation = 'auto' | 'portrait' | 'landscape';
export type ImagesToPdfMargin = 'none' | 'normal' | 'wide';

export interface ImagesToPdfOptions {
  pageSize: ImagesToPdfPageSize;
  orientation: ImagesToPdfOrientation;
  margin: ImagesToPdfMargin;
}

const MARGIN_PT: Record<ImagesToPdfMargin, number> = { none: 0, normal: 36, wide: 72 };
/** CSS-pixel convention (96 DPI) for turning an image's raw pixel size into a physical page size. */
const PX_TO_PT = 0.75;

async function decodeRotatedImage(file: File, rotationDegrees: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    const swap = rotationDegrees === 90 || rotationDegrees === 270;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? bitmap.height : bitmap.width;
    canvas.height = swap ? bitmap.width : bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available.');

    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotationDegrees * Math.PI) / 180);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    return canvas;
  } finally {
    bitmap.close();
  }
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('The image could not be encoded.'));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');
  });
}

/**
 * Every image is redecoded through a canvas and re-embedded as PNG, even when it started as a
 * JPEG — the uniform path is what makes rotation trivial (rotate the pixels, not the PDF
 * transform matrix) at the cost of some file size next to embedding a JPEG's bytes directly.
 */
export async function buildPdfFromImages(
  files: readonly File[],
  rotations: readonly number[],
  options: ImagesToPdfOptions,
  signal?: AbortSignal,
  onPage?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const { PDFDocument, PageSizes } = await import('pdf-lib');
  const document_ = await PDFDocument.create();
  const margin = MARGIN_PT[options.margin];

  for (let i = 0; i < files.length; i += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const file = files[i]!;
    const rotation = rotations[i] ?? 0;

    const canvas = await decodeRotatedImage(file, rotation);
    const pngBytes = await canvasToPngBytes(canvas);
    const embedded = await document_.embedPng(pngBytes);

    let pageWidth: number;
    let pageHeight: number;
    let scale: number;

    if (options.pageSize === 'fit') {
      scale = PX_TO_PT;
      pageWidth = canvas.width * scale + margin * 2;
      pageHeight = canvas.height * scale + margin * 2;
    } else {
      const [baseWidth, baseHeight] =
        options.pageSize === 'letter' ? PageSizes.Letter : PageSizes.A4;
      const wantsPortrait =
        options.orientation === 'portrait' ||
        (options.orientation === 'auto' && canvas.height >= canvas.width);
      const long = Math.max(baseWidth, baseHeight);
      const short = Math.min(baseWidth, baseHeight);
      pageWidth = wantsPortrait ? short : long;
      pageHeight = wantsPortrait ? long : short;

      const boxWidth = pageWidth - margin * 2;
      const boxHeight = pageHeight - margin * 2;
      scale = Math.min(boxWidth / canvas.width, boxHeight / canvas.height);
    }

    const page = document_.addPage([pageWidth, pageHeight]);
    const drawWidth = canvas.width * scale;
    const drawHeight = canvas.height * scale;
    page.drawImage(embedded, {
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });

    onPage?.(i + 1, files.length);
  }

  return document_.save();
}
