/**
 * Pure geometry for Scan to PDF's crop step: solving a perspective (homography) transform from
 * four corner correspondences, warping pixels through it, and a heuristic that guesses a
 * document's four corners from edge energy so "Auto detect" has a starting point to drag from.
 * Kept free of `document`/`canvas` so it runs under Vitest directly; only `{ data, width,
 * height }` rasters (which a real `ImageData` also satisfies) cross this module's boundary.
 */

export interface Point {
  x: number;
  y: number;
}

/** Structurally compatible with `ImageData`, but not tied to the DOM so this is Node-testable. */
export interface RasterImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Solves the 3x3 projective matrix H (row-major, h[8] normalised to 1) that maps each `src[i]`
 * to `dst[i]`, via the standard 8-unknown linear system solved by Gaussian elimination with
 * partial pivoting. Used in `warpPerspective` with `src` = output rectangle corners and `dst` =
 * the quadrilateral in the source image, so the result maps an output pixel straight back to
 * where it should be sampled from (inverse mapping — the only way to avoid holes in the output).
 */
export function computeHomography(
  src: readonly [Point, Point, Point, Point],
  dst: readonly [Point, Point, Point, Point],
): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const { x, y } = src[i]!;
    const { x: xp, y: yp } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -x * xp, -y * xp]);
    b.push(xp);
    A.push([0, 0, 0, x, y, 1, -x * yp, -y * yp]);
    b.push(yp);
  }

  const h = solveLinearSystem(A, b);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const M = matrix.map((row, i) => [...row, vector[i]!]);

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(M[row]![col]!) > Math.abs(M[pivotRow]![col]!)) pivotRow = row;
    }
    [M[col], M[pivotRow]] = [M[pivotRow]!, M[col]!];

    const pivot = M[col]![col]!;
    if (Math.abs(pivot) < 1e-12) continue;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = M[row]![col]! / pivot;
      if (factor === 0) continue;
      for (let k = col; k <= n; k += 1) M[row]![k]! -= factor * M[col]![k]!;
    }
  }

  return M.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : row[row.length - 1]! / row[i]!));
}

/** Applies homography `h` (row-major 3x3) to a point, dividing through by the homogeneous `w`. */
export function applyHomography(h: readonly number[], point: Point): Point {
  const w = h[6]! * point.x + h[7]! * point.y + h[8]!;
  return {
    x: (h[0]! * point.x + h[1]! * point.y + h[2]!) / w,
    y: (h[3]! * point.x + h[4]! * point.y + h[5]!) / w,
  };
}

function sampleBilinear(
  source: RasterImage,
  x: number,
  y: number,
): [number, number, number, number] {
  if (x < 0 || y < 0 || x > source.width - 1 || y > source.height - 1) return [0, 0, 0, 0];

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, source.width - 1);
  const y1 = Math.min(y0 + 1, source.height - 1);
  const fx = x - x0;
  const fy = y - y0;

  const at = (px: number, py: number, channel: number) =>
    source.data[(py * source.width + px) * 4 + channel]!;
  const mix = (channel: number) => {
    const top = at(x0, y0, channel) * (1 - fx) + at(x1, y0, channel) * fx;
    const bottom = at(x0, y1, channel) * (1 - fx) + at(x1, y1, channel) * fx;
    return top * (1 - fy) + bottom * fy;
  };

  return [mix(0), mix(1), mix(2), mix(3)];
}

/**
 * Straightens the quadrilateral `corners` (in `source`'s pixel space, top-left/top-right/
 * bottom-right/bottom-left order) into an `outWidth` x `outHeight` axis-aligned raster —
 * document scanning's "flatten the perspective" step. Every output pixel is inverse-mapped
 * through the homography and bilinear-sampled, so the result has no holes even though the
 * source quadrilateral is skewed.
 */
export function warpPerspective(
  source: RasterImage,
  corners: readonly [Point, Point, Point, Point],
  outWidth: number,
  outHeight: number,
): RasterImage {
  const outputCorners: [Point, Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight },
    { x: 0, y: outHeight },
  ];
  const h = computeHomography(outputCorners, corners);

  const data = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const src = applyHomography(h, { x: x + 0.5, y: y + 0.5 });
      const [r, g, b, a] = sampleBilinear(source, src.x, src.y);
      const i = (y * outWidth + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }

  return { data, width: outWidth, height: outHeight };
}

/** Crops an axis-aligned rectangle without any resampling loss beyond the pixel grid itself. */
export function cropRect(
  source: RasterImage,
  x: number,
  y: number,
  width: number,
  height: number,
): RasterImage {
  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const w = Math.max(1, Math.min(Math.round(width), source.width - left));
  const h = Math.max(1, Math.min(Math.round(height), source.height - top));

  const data = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    const srcStart = ((top + row) * source.width + left) * 4;
    const dstStart = row * w * 4;
    data.set(source.data.subarray(srcStart, srcStart + w * 4), dstStart);
  }
  return { data, width: w, height: h };
}

function toGrayscale(source: RasterImage): Float32Array {
  const gray = new Float32Array(source.width * source.height);
  for (let i = 0; i < gray.length; i += 1) {
    const o = i * 4;
    gray[i] = 0.299 * source.data[o]! + 0.587 * source.data[o + 1]! + 0.114 * source.data[o + 2]!;
  }
  return gray;
}

/** Sobel gradient magnitude, used only to find document edges — not stored or returned. */
function gradientMagnitude(gray: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  const at = (x: number, y: number) =>
    gray[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))]!;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gx =
        -at(x - 1, y - 1) -
        2 * at(x - 1, y) -
        at(x - 1, y + 1) +
        at(x + 1, y - 1) +
        2 * at(x + 1, y) +
        at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1) +
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1);
      out[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

/**
 * Guesses a document's four corners from edge energy: a Sobel gradient magnitude map, projected
 * to per-row and per-column energy sums, then walked inward from each side until the energy
 * crosses a fraction of that side's peak. This is deliberately a coarse heuristic — it finds an
 * axis-aligned bounding box, not a true rotated quadrilateral — good enough as a starting point
 * for the perspective corners, which the user then drags to fit. If the image has too little
 * edge energy to find a confident boundary (a blank or very low-contrast photo), it falls back
 * to a 4%-inset rectangle rather than guessing wildly.
 */
export function detectDocumentCorners(source: RasterImage): [Point, Point, Point, Point] {
  const { width, height } = source;
  const gray = toGrayscale(source);
  const grad = gradientMagnitude(gray, width, height);

  const rowEnergy = new Float32Array(height);
  const colEnergy = new Float32Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = grad[y * width + x]!;
      rowEnergy[y]! += v;
      colEnergy[x]! += v;
    }
  }

  const fallback: [Point, Point, Point, Point] = [
    { x: width * 0.04, y: height * 0.04 },
    { x: width * 0.96, y: height * 0.04 },
    { x: width * 0.96, y: height * 0.96 },
    { x: width * 0.04, y: height * 0.96 },
  ];

  function boundary(energy: Float32Array, fromStart: boolean): number | null {
    const peak = Math.max(...energy);
    if (peak <= 0) return null;
    const threshold = peak * 0.15;
    const n = energy.length;
    if (fromStart) {
      for (let i = 0; i < n; i += 1) if (energy[i]! >= threshold) return i;
    } else {
      for (let i = n - 1; i >= 0; i -= 1) if (energy[i]! >= threshold) return i;
    }
    return null;
  }

  const top = boundary(rowEnergy, true);
  const bottom = boundary(rowEnergy, false);
  const left = boundary(colEnergy, true);
  const right = boundary(colEnergy, false);

  if (
    top === null ||
    bottom === null ||
    left === null ||
    right === null ||
    right - left < width * 0.1 ||
    bottom - top < height * 0.1
  ) {
    return fallback;
  }

  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}
