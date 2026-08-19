'use client';

/** Crops a canvas down to the bounding box of its non-transparent pixels, so a signature drawn
 * or typed in the middle of a wide pad does not embed as a mostly-empty image with the ink
 * pushed into one corner. Returns `null` if nothing was drawn. */
export function trimToContent(canvas: HTMLCanvasElement, padding = 8): HTMLCanvasElement | null {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;

  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);

  const trimmed = document.createElement('canvas');
  trimmed.width = maxX - minX + 1;
  trimmed.height = maxY - minY + 1;
  const trimmedContext = trimmed.getContext('2d');
  if (!trimmedContext) return null;
  trimmedContext.drawImage(
    canvas,
    minX,
    minY,
    trimmed.width,
    trimmed.height,
    0,
    0,
    trimmed.width,
    trimmed.height,
  );
  return trimmed;
}

/** Renders typed text onto a transparent canvas in a cursive system font, so a "typed"
 * signature is produced the same way a drawn one is — a transparent PNG the workspace can
 * treat identically either way. */
export function renderTypedSignature(text: string, fontSizePx = 64): HTMLCanvasElement {
  const measure = document.createElement('canvas').getContext('2d')!;
  const font = `italic ${fontSizePx}px "Segoe Script", "Brush Script MT", cursive`;
  measure.font = font;
  const width = Math.max(80, Math.ceil(measure.measureText(text).width) + 40);
  const height = Math.ceil(fontSizePx * 1.8);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.font = font;
  context.fillStyle = '#1a1a1a';
  context.textBaseline = 'middle';
  context.fillText(text, 20, height / 2);
  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The signature could not be captured.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}
