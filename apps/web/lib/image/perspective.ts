export interface Point {
  x: number;
  y: number;
}

/** Gaussian elimination with partial pivoting. `A` is square, `b` is its right hand side. */
function solveLinearSystem(a: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    }
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];

    const pivotValue = m[col]![col]!;
    for (let c = col; c <= n; c += 1) m[col]![c] = m[col]![c]! / pivotValue;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row]![col]!;
      for (let c = col; c <= n; c += 1) m[row]![c] = m[row]![c]! - factor * m[col]![c]!;
    }
  }

  return m.map((row) => row[n]!);
}

/**
 * Solves the 3x3 projective homography (with h33 fixed to 1, the usual normalisation) that
 * maps each `from` corner onto the matching `to` corner. Both quads must list corners in the
 * same order (this module always uses top left, top right, bottom right, bottom left).
 */
function computeHomography(from: readonly Point[], to: readonly Point[]): number[] {
  const rows: number[][] = [];
  const rhs: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const { x: sx, y: sy } = from[i]!;
    const { x: dx, y: dy } = to[i]!;
    rows.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    rhs.push(dx);
    rows.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    rhs.push(dy);
  }

  const h = solveLinearSystem(rows, rhs);
  return [...h, 1];
}

function applyHomography(h: readonly number[], x: number, y: number): Point {
  const w = h[6]! * x + h[7]! * y + h[8]!;
  return {
    x: (h[0]! * x + h[1]! * y + h[2]!) / w,
    y: (h[3]! * x + h[4]! * y + h[5]!) / w,
  };
}

function sampleBilinear(data: ImageData, x: number, y: number): [number, number, number, number] {
  const { width, height } = data;
  if (x < -1 || y < -1 || x > width || y > height) return [0, 0, 0, 0];

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(Math.max(x0 + 1, 0), width - 1);
  const y1 = Math.min(Math.max(y0 + 1, 0), height - 1);
  const cx0 = Math.min(Math.max(x0, 0), width - 1);
  const cy0 = Math.min(Math.max(y0, 0), height - 1);
  const fx = x - x0;
  const fy = y - y0;

  const read = (px: number, py: number): [number, number, number, number] => {
    const i = (py * width + px) * 4;
    return [data.data[i]!, data.data[i + 1]!, data.data[i + 2]!, data.data[i + 3]!];
  };
  const p00 = read(cx0, cy0);
  const p10 = read(x1, cy0);
  const p01 = read(cx0, y1);
  const p11 = read(x1, y1);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c += 1) {
    const top = lerp(p00[c]!, p10[c]!, fx);
    const bottom = lerp(p01[c]!, p11[c]!, fx);
    out[c] = lerp(top, bottom, fy);
  }
  return out;
}

/**
 * Warps the quad `corners` (top left, top right, bottom right, bottom left, in source pixel
 * space) into a flat `width` x `height` rectangle, correcting the perspective distortion a
 * photo taken at an angle has. Every output pixel is filled by sampling the homography's
 * inverse mapping back into the source with bilinear interpolation, so the result stays sharp
 * even when the quad is rotated or skewed relative to the canvas.
 */
export function perspectiveWarp(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  corners: readonly [Point, Point, Point, Point],
  width: number,
  height: number,
): HTMLCanvasElement {
  const src = document.createElement('canvas');
  src.width = sourceWidth;
  src.height = sourceHeight;
  const srcCtx = src.getContext('2d');
  if (!srcCtx) throw new Error('A drawing surface is not available in this browser.');
  srcCtx.drawImage(source, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, sourceWidth, sourceHeight);

  const dstRect: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  // Maps a DEST pixel straight to its SOURCE pixel, so filling the output is one lookup per
  // pixel rather than an inverse search.
  const h = computeHomography(dstRect, corners);

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('A drawing surface is not available in this browser.');
  const outData = outCtx.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source_point = applyHomography(h, x + 0.5, y + 0.5);
      const pixel = sampleBilinear(srcData, source_point.x, source_point.y);
      const i = (y * width + x) * 4;
      outData.data[i] = pixel[0];
      outData.data[i + 1] = pixel[1];
      outData.data[i + 2] = pixel[2];
      outData.data[i + 3] = pixel[3];
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return out;
}
