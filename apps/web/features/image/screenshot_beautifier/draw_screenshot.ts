import { fitBox } from '@/lib/image/canvas';
import { GRADIENT_DIRECTIONS, type BackgroundType } from './background_options';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface ScreenshotDrawOptions {
  backgroundType: BackgroundType;
  backgroundColor: string;
  backgroundColor2: string;
  direction: string;
  padding: number;
  cornerRadius: number;
  /** 0 to 100. Zero draws no shadow at all. */
  shadowStrength: number;
  frame: boolean;
  frameColor: string;
  dotColor: string;
  /** Height of the title bar when `frame` is on, in the same pixel units as the canvas. */
  titleBarHeight: number;
  /**
   * Ratio of this canvas to the exported one. Padding, corner rounding and the shadow are set
   * in exported pixels, so the smaller preview canvas multiplies them by this to look the same.
   * Defaults to 1.
   */
  scale?: number;
}

/** Title bar height for a finished composition of this height, in that canvas's own pixels. */
export function titleBarHeightFor(canvasHeight: number): number {
  return Math.round(canvasHeight * 0.045) + 20;
}

function roundRectPath(
  ctx: Ctx2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function paintBackground(
  ctx: Ctx2D,
  width: number,
  height: number,
  options: ScreenshotDrawOptions,
): void {
  if (options.backgroundType === 'solid') {
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const direction =
    GRADIENT_DIRECTIONS.find((item) => item.id === options.direction) ?? GRADIENT_DIRECTIONS[0]!;
  const gradient = ctx.createLinearGradient(0, 0, direction.dx * width, direction.dy * height);
  gradient.addColorStop(0, options.backgroundColor);
  gradient.addColorStop(1, options.backgroundColor2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Paints the beautified composition: a solid or gradient background, then the screenshot
 * (optionally inside a generic window frame) with rounded corners and a drop shadow. The
 * shadow is painted as its own filled pass before the rounded rect is used to clip the frame
 * content, since a shadow drawn after clipping would be cut away along with the corners.
 */
export function drawScreenshotComposition(
  ctx: Ctx2D,
  canvasWidth: number,
  canvasHeight: number,
  bitmap: ImageBitmap | null,
  options: ScreenshotDrawOptions,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  paintBackground(ctx, canvasWidth, canvasHeight, options);

  if (!bitmap) return;

  const scale = options.scale && options.scale > 0 ? options.scale : 1;
  const padding = Math.max(0, options.padding) * scale;
  const titleBarHeight = options.frame ? options.titleBarHeight : 0;
  const maxContentWidth = Math.max(1, canvasWidth - padding * 2);
  const maxContentHeight = Math.max(1, canvasHeight - padding * 2 - titleBarHeight);

  const fitted = fitBox(
    { width: bitmap.width, height: bitmap.height },
    { width: maxContentWidth, height: maxContentHeight },
    'contain',
  );

  const frameWidth = fitted.width;
  const frameHeight = fitted.height + titleBarHeight;
  const frameX = (canvasWidth - frameWidth) / 2;
  const frameY = (canvasHeight - frameHeight) / 2;
  const radius = Math.max(0, options.cornerRadius) * scale;

  if (options.shadowStrength > 0) {
    const strength = Math.min(1, options.shadowStrength / 100);
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${0.18 + 0.42 * strength})`;
    ctx.shadowBlur = (12 + 70 * strength) * scale;
    ctx.shadowOffsetY = (8 + 34 * strength) * scale;
    ctx.fillStyle = options.frame ? options.frameColor : '#ffffff';
    roundRectPath(ctx, frameX, frameY, frameWidth, frameHeight, radius);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  roundRectPath(ctx, frameX, frameY, frameWidth, frameHeight, radius);
  ctx.clip();

  if (options.frame) {
    ctx.fillStyle = options.frameColor;
    ctx.fillRect(frameX, frameY, frameWidth, titleBarHeight);

    const dotRadius = titleBarHeight * 0.13;
    const dotY = frameY + titleBarHeight / 2;
    const dotSpacing = dotRadius * 3;
    const startX = frameX + titleBarHeight * 0.55;
    for (let index = 0; index < 3; index += 1) {
      ctx.beginPath();
      ctx.fillStyle = options.dotColor;
      ctx.globalAlpha = 0.85 - index * 0.15;
      ctx.arc(startX + index * dotSpacing, dotY, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(bitmap, frameX, frameY + titleBarHeight, fitted.width, fitted.height);
  ctx.restore();
}
