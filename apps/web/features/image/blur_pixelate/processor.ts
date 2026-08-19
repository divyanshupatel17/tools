import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension, safeFileName, validateFiles } from '@tools/file_utils';
import { createCanvas, type Canvas2D } from '@/lib/image/canvas';
import {
  IMAGE_EXTENSION,
  IMAGE_MIME,
  imageRule,
  type OutputFormat,
} from '@/lib/image/image_formats';

export type RegionEffect = 'blur' | 'strong_blur' | 'pixelate';

export interface BlurRegion {
  /** Fractions of the full image, 0 to 1, top left origin. Clamped again here for safety. */
  x: number;
  y: number;
  width: number;
  height: number;
  effect: RegionEffect;
  /** 1 to 20. What it means depends on the effect; see `pixelateBlockSize` and `blurRadius`. */
  strength: number;
}

export interface BlurPixelateOptions {
  regions: BlurRegion[];
  format: OutputFormat;
  /** 0 to 1. Ignored for PNG. */
  quality?: number;
  /** Fills transparency when the chosen format has no alpha channel. */
  background?: string;
}

const MAX_BYTES = 60 * 1024 * 1024;

const MAX_STRENGTH = 20;

/**
 * Block size as a fraction of the region's own smaller side, not a fixed pixel count, so a
 * region drawn on a small preview canvas and the same region applied at full export resolution
 * look equally pixelated. Strength 1 gives a barely blocky look; strength 20 is heavily blocky.
 */
function pixelateBlockSize(strength: number, regionWidth: number, regionHeight: number): number {
  const base = Math.min(regionWidth, regionHeight);
  const fraction = 0.03 + (Math.min(MAX_STRENGTH, Math.max(1, strength)) / 10) * 0.22;
  return Math.max(2, Math.round(base * fraction));
}

/** Same proportional idea as `pixelateBlockSize`, so preview and export blur match visually. */
function blurRadius(
  strength: number,
  regionWidth: number,
  regionHeight: number,
  strong: boolean,
): number {
  const base = Math.min(regionWidth, regionHeight);
  const clamped = Math.min(MAX_STRENGTH, Math.max(1, strength)) / 10;
  const fraction = strong ? 0.08 + clamped * 0.32 : 0.03 + clamped * 0.15;
  return Math.max(1, base * fraction);
}

/**
 * Genuinely destroys the pixels under each region: pixelate downsamples the region to a small
 * canvas and draws it back up with smoothing disabled, blur draws the region through the canvas
 * `filter` property. Both replace the region's pixels in place; nothing is merely painted over
 * the top, so the source detail cannot be recovered from the exported file.
 */
export function renderRegions(
  source: CanvasImageSource,
  width: number,
  height: number,
  regions: readonly BlurRegion[],
): Canvas2D {
  const target = createCanvas(width, height);
  target.ctx.drawImage(source, 0, 0, width, height);

  for (const region of regions) {
    const rx = Math.max(0, Math.min(Math.round(region.x * width), width - 1));
    const ry = Math.max(0, Math.min(Math.round(region.y * height), height - 1));
    const rw = Math.max(1, Math.min(Math.round(region.width * width), width - rx));
    const rh = Math.max(1, Math.min(Math.round(region.height * height), height - ry));
    if (rw <= 0 || rh <= 0) continue;

    if (region.effect === 'pixelate') {
      const blockSize = pixelateBlockSize(region.strength, rw, rh);
      const smallWidth = Math.max(1, Math.round(rw / blockSize));
      const smallHeight = Math.max(1, Math.round(rh / blockSize));
      const small = createCanvas(smallWidth, smallHeight);
      small.ctx.imageSmoothingEnabled = true;
      small.ctx.drawImage(target.canvas, rx, ry, rw, rh, 0, 0, smallWidth, smallHeight);

      target.ctx.imageSmoothingEnabled = false;
      target.ctx.clearRect(rx, ry, rw, rh);
      target.ctx.drawImage(small.canvas, 0, 0, smallWidth, smallHeight, rx, ry, rw, rh);
      target.ctx.imageSmoothingEnabled = true;
      continue;
    }

    const radius = blurRadius(region.strength, rw, rh, region.effect === 'strong_blur');
    // Sample a padded area around the region so the blur has real neighbouring pixels to draw
    // on, instead of fading to transparent at the region's own edge.
    const pad = Math.min(width, height, Math.ceil(radius * 2));
    const sx = Math.max(0, rx - pad);
    const sy = Math.max(0, ry - pad);
    const sw = Math.min(width, rx + rw + pad) - sx;
    const sh = Math.min(height, ry + rh + pad) - sy;

    const padded = createCanvas(sw, sh);
    padded.ctx.filter = `blur(${radius}px)`;
    padded.ctx.drawImage(target.canvas, sx, sy, sw, sh, 0, 0, sw, sh);

    target.ctx.clearRect(rx, ry, rw, rh);
    target.ctx.drawImage(padded.canvas, rx - sx, ry - sy, rw, rh, rx, ry, rw, rh);
  }

  return target;
}

const blurPixelate: ToolProcessor<BlurPixelateOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const validation = validateFiles(files, imageRule({ max_files: 1, max_bytes: MAX_BYTES }));
  if (!validation.ok) {
    throw new ProcessorError(
      'image_blur_invalid_input',
      validation.errors[0] ?? 'This file cannot be processed.',
    );
  }

  const file = files[0];
  if (!file) throw new ProcessorError('image_blur_no_file', 'Choose an image to blur or pixelate.');

  if (options.regions.length === 0) {
    throw new ProcessorError(
      'image_blur_no_regions',
      'Draw at least one region to blur or pixelate.',
    );
  }

  on_progress?.({ ratio: 0.1, label: 'Reading image' });
  const { decodeImage } = await import('@/lib/image/decode');
  const decoded = await decodeImage(file);

  try {
    if (signal.aborted)
      throw new ProcessorError('image_blur_aborted', 'The operation was cancelled.');

    on_progress?.({ ratio: 0.4, label: 'Applying effects' });
    const { canvas } = renderRegions(
      decoded.bitmap,
      decoded.width,
      decoded.height,
      options.regions,
    );

    if (signal.aborted)
      throw new ProcessorError('image_blur_aborted', 'The operation was cancelled.');

    on_progress?.({ ratio: 0.75, label: 'Encoding' });
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
      text: String(options.regions.length),
    };
  } finally {
    decoded.bitmap.close();
  }
};

export default blurPixelate;
