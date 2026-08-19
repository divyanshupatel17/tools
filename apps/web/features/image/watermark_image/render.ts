import { watermarkPositions } from '@/lib/pdf/watermark';

/** Nine anchor points on a three by three grid, plus a tiled mode covering the whole picture. */
export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'tile';

export const WATERMARK_ANCHORS: readonly Exclude<WatermarkPosition, 'tile'>[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

export interface WatermarkImageOptions {
  kind: 'text' | 'image';
  text: string;
  /** Authored against `DESIGN_WIDTH`; scaled to the canvas actually being painted. */
  font_size: number;
  color: string;
  font_weight: number;
  /** Percent of the base image's width. Resolution independent, so it needs no scaling. */
  image_scale: number;
  position: WatermarkPosition;
  /** 0 to 1. */
  opacity: number;
  /** Degrees. */
  rotation: number;
  /** Overall size multiplier, percent. */
  scale: number;
}

export interface WatermarkLogo {
  bitmap: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * The width `font_size` is authored against. Both the workspace preview canvas and the full
 * resolution export canvas scale that canonical size by their own width divided by this
 * constant, so a font size that looks right in the preview lands at the same relative size in
 * the download — the "get it right" requirement for these tools.
 */
export const DESIGN_WIDTH = 420;

const MARGIN_RATIO = 0.06;

function anchorPoint(position: Exclude<WatermarkPosition, 'tile'>, width: number, height: number) {
  if (position === 'center') return { x: width / 2, y: height / 2 };
  const [vertical, horizontal] = position.split('-') as [string, string];
  const marginX = width * MARGIN_RATIO;
  const marginY = height * MARGIN_RATIO;
  const x = horizontal === 'left' ? marginX : horizontal === 'right' ? width - marginX : width / 2;
  const y = vertical === 'top' ? marginY : vertical === 'bottom' ? height - marginY : height / 2;
  return { x, y };
}

export interface RenderWatermarkArgs {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  options: WatermarkImageOptions;
  logo?: WatermarkLogo | null;
}

/**
 * Paints the watermark (text or logo) onto an already drawn base image, at every tile point or
 * the single chosen anchor. Shared verbatim between the live preview and the export so the
 * download matches what the user tuned by eye.
 */
export function renderWatermark({
  ctx,
  canvasWidth,
  canvasHeight,
  options,
  logo,
}: RenderWatermarkArgs): void {
  const sizeScale = Math.max(0, options.scale) / 100;
  const fontScale = canvasWidth / DESIGN_WIDTH;

  const points =
    options.position === 'tile'
      ? watermarkPositions(canvasWidth, canvasHeight, true)
      : [anchorPoint(options.position, canvasWidth, canvasHeight)];

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, options.opacity));

  for (const point of points) {
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate((options.rotation * Math.PI) / 180);

    if (options.kind === 'text') {
      const text = options.text.trim();
      if (text) {
        const fontSize = Math.max(1, options.font_size * fontScale * sizeScale);
        ctx.font = `${options.font_weight} ${fontSize}px system-ui, sans-serif`;
        ctx.fillStyle = options.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, 0);
      }
    } else if (logo) {
      const logoWidth = canvasWidth * (options.image_scale / 100) * sizeScale;
      const logoHeight = logoWidth * (logo.height / logo.width || 1);
      ctx.drawImage(logo.bitmap, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
    }

    ctx.restore();
  }

  ctx.restore();
}
