export type CropDragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The smallest crop box a person can drag down to, in the source's own natural pixels. */
export const MIN_CROP_SIZE = 16;

/** Applies one pointer drag delta (already in natural pixels) to a crop box, clamped in bounds. */
export function applyCropDrag(
  mode: CropDragMode,
  box: CropBox,
  dx: number,
  dy: number,
  natural: { width: number; height: number },
): CropBox {
  const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);
  let { x, y, width, height } = box;

  if (mode === 'move') {
    x = clamp(x + dx, 0, natural.width - width);
    y = clamp(y + dy, 0, natural.height - height);
    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
  }

  if (mode.includes('w')) {
    const nextX = clamp(x + dx, 0, x + width - MIN_CROP_SIZE);
    width += x - nextX;
    x = nextX;
  }
  if (mode.includes('e')) {
    width = clamp(width + dx, MIN_CROP_SIZE, natural.width - x);
  }
  if (mode.includes('n')) {
    const nextY = clamp(y + dy, 0, y + height - MIN_CROP_SIZE);
    height += y - nextY;
    y = nextY;
  }
  if (mode.includes('s')) {
    height = clamp(height + dy, MIN_CROP_SIZE, natural.height - y);
  }

  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/**
 * The on screen rect `object-contain` paints a `natural` sized image into inside a `container`
 * box: full width with letterboxed top/bottom, or full height with letterboxed left/right.
 */
export function containRect(
  container: { width: number; height: number },
  natural: { width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  if (container.width <= 0 || container.height <= 0 || natural.width <= 0 || natural.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const containerRatio = container.width / container.height;
  const naturalRatio = natural.width / natural.height;
  const width = naturalRatio > containerRatio ? container.width : container.height * naturalRatio;
  const height = naturalRatio > containerRatio ? container.width / naturalRatio : container.height;
  return { left: (container.width - width) / 2, top: (container.height - height) / 2, width, height };
}
