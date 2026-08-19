import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension, safeFileName, validateFiles } from '@tools/file_utils';
import {
  IMAGE_EXTENSION,
  IMAGE_MIME,
  imageRule,
  supportsAlpha,
  type OutputFormat,
} from '@/lib/image/image_formats';
import type { Point } from '@/lib/image/perspective';

export interface CropImageOptions {
  /** Real pixel offsets and size, not display coordinates. Clamped again here for safety.
   *  Ignored when `perspective` is set. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Cuts a circle out of the crop. Requires a format that keeps transparency. */
  circle?: boolean;
  format: OutputFormat;
  /** 0 to 1. Ignored for PNG. */
  quality?: number;
  /** Fills transparency when the chosen format has no alpha channel. */
  background?: string;
  /** When set, warps this quad (top left, top right, bottom right, bottom left, in real
   *  source pixel coordinates) into an output_width x output_height rectangle instead of an
   *  axis aligned crop, correcting the perspective of a photo taken at an angle. */
  perspective?: {
    corners: readonly [Point, Point, Point, Point];
    output_width: number;
    output_height: number;
  };
}

const MAX_BYTES = 60 * 1024 * 1024;

const cropImage: ToolProcessor<CropImageOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const validation = validateFiles(files, imageRule({ max_files: 1, max_bytes: MAX_BYTES }));
  if (!validation.ok) {
    throw new ProcessorError(
      'image_crop_invalid_input',
      validation.errors[0] ?? 'This file cannot be cropped.',
    );
  }

  const file = files[0];
  if (!file) throw new ProcessorError('image_crop_no_file', 'Choose an image to crop.');

  if (options.circle && !supportsAlpha(options.format)) {
    throw new ProcessorError(
      'image_crop_needs_alpha',
      'A circle crop needs a format that keeps transparency, such as PNG or WebP.',
    );
  }

  on_progress?.({ ratio: 0.1, label: 'Reading image' });
  const { decodeImage } = await import('@/lib/image/decode');
  const decoded = await decodeImage(file);

  try {
    if (signal.aborted) throw new ProcessorError('image_crop_aborted', 'Cropping was cancelled.');

    on_progress?.({ ratio: 0.4, label: 'Cropping' });

    const { createCanvas } = await import('@/lib/image/canvas');

    let width: number;
    let height: number;
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;

    if (options.perspective) {
      width = Math.max(1, Math.round(options.perspective.output_width));
      height = Math.max(1, Math.round(options.perspective.output_height));
      const { perspectiveWarp } = await import('@/lib/image/perspective');
      canvas = perspectiveWarp(
        decoded.bitmap,
        decoded.width,
        decoded.height,
        options.perspective.corners,
        width,
        height,
      );
      const perspectiveCtx = canvas.getContext('2d');
      if (!perspectiveCtx) {
        throw new ProcessorError(
          'image_canvas_unavailable',
          'A drawing surface is not available in this browser.',
        );
      }
      ctx = perspectiveCtx;
    } else {
      // Clamp to the real image bounds so a selection dragged past the edge in the UI
      // can never produce an out of bounds crop here.
      const x = Math.max(0, Math.min(Math.round(options.x), decoded.width - 1));
      const y = Math.max(0, Math.min(Math.round(options.y), decoded.height - 1));
      width = Math.max(1, Math.min(Math.round(options.width), decoded.width - x));
      height = Math.max(1, Math.min(Math.round(options.height), decoded.height - y));
      const created = createCanvas(width, height);
      canvas = created.canvas;
      ctx = created.ctx;
      ctx.drawImage(decoded.bitmap, x, y, width, height, 0, 0, width, height);
    }

    if (options.circle) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    on_progress?.({ ratio: 0.7, label: 'Encoding' });

    const { encodeCanvas } = await import('@/lib/image/encode');
    const blob = await encodeCanvas(canvas, {
      format: options.format,
      quality: options.quality,
      background: options.background,
    });

    on_progress?.({ ratio: 1, label: 'Done' });

    const fileName = replaceExtension(safeFileName(file.name), IMAGE_EXTENSION[options.format]);

    return {
      artifacts: [{ file_name: fileName, mime_type: IMAGE_MIME[options.format], blob }],
      text: `${width}x${height}`,
    };
  } finally {
    decoded.bitmap.close();
  }
};

export default cropImage;
