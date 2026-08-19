export interface Canvas2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d context is not available.');
  return ctx;
}

export function createCanvas(width: number, height: number): Canvas2D {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return { canvas, ctx: get2dContext(canvas) };
}

/**
 * Draws a bitmap at a new size. Downscaling by more than 2x steps down in halves, which
 * a single drawImage does not do and which is the difference between a crisp thumbnail
 * and a jagged one.
 */
export function drawResized(
  source: ImageBitmap | HTMLCanvasElement,
  width: number,
  height: number,
  options?: { smoothing?: 'high' | 'medium' | 'low' | 'none' },
): Canvas2D {
  const targetWidth = Math.max(1, Math.round(width));
  const targetHeight = Math.max(1, Math.round(height));

  let currentSource: ImageBitmap | HTMLCanvasElement = source;
  let currentWidth = source.width;
  let currentHeight = source.height;

  while (
    currentWidth > targetWidth * 2 &&
    currentHeight > targetHeight * 2 &&
    (currentWidth > 1 || currentHeight > 1)
  ) {
    const stepWidth = Math.max(targetWidth, Math.round(currentWidth / 2));
    const stepHeight = Math.max(targetHeight, Math.round(currentHeight / 2));
    const step = createCanvas(stepWidth, stepHeight);
    step.ctx.imageSmoothingEnabled = true;
    step.ctx.imageSmoothingQuality = 'high';
    step.ctx.drawImage(currentSource, 0, 0, stepWidth, stepHeight);

    if (currentSource !== source && 'close' in currentSource) {
      (currentSource as ImageBitmap).close();
    }

    currentSource = step.canvas;
    currentWidth = stepWidth;
    currentHeight = stepHeight;
  }

  const result = createCanvas(targetWidth, targetHeight);
  const smoothing = options?.smoothing ?? 'high';
  result.ctx.imageSmoothingEnabled = smoothing !== 'none';
  if (smoothing !== 'none') result.ctx.imageSmoothingQuality = smoothing;
  result.ctx.drawImage(currentSource, 0, 0, targetWidth, targetHeight);

  if (currentSource !== source && 'close' in currentSource) {
    (currentSource as ImageBitmap).close();
  }

  return result;
}

/** Paints a solid colour underneath, for formats with no alpha. */
export function flatten(canvas: HTMLCanvasElement, background: string): Canvas2D {
  const result = createCanvas(canvas.width, canvas.height);
  result.ctx.fillStyle = background;
  result.ctx.fillRect(0, 0, canvas.width, canvas.height);
  result.ctx.drawImage(canvas, 0, 0);
  return result;
}

/** Fits (width, height) inside a box, or fills it, keeping the aspect ratio. */
export function fitBox(
  natural: { width: number; height: number },
  box: { width: number; height: number },
  mode: 'contain' | 'cover',
): { width: number; height: number } {
  if (natural.width <= 0 || natural.height <= 0 || box.width <= 0 || box.height <= 0) {
    return { width: box.width, height: box.height };
  }

  const naturalRatio = natural.width / natural.height;
  const boxRatio = box.width / box.height;

  // Contain fits by width when the image is relatively wider than the box (it would
  // otherwise overflow horizontally); cover does the opposite, overflowing on purpose.
  const fitByWidth = mode === 'contain' ? naturalRatio >= boxRatio : naturalRatio < boxRatio;

  if (fitByWidth) {
    return { width: box.width, height: box.width / naturalRatio };
  }
  return { width: box.height * naturalRatio, height: box.height };
}
