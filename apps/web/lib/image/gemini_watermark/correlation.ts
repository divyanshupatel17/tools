/**
 * Zero mean normalized cross correlation between a candidate image region and an alpha
 * template, in the brightness domain and in the gradient domain.
 *
 * Ported from `adaptiveDetector.js` in GargantuaX/gemini-watermark-remover (MIT licensed). This
 * is what decides whether a candidate position from the size catalog actually matches the pixels
 * in front of it, rather than trusting the catalog lookup blindly.
 */

const EPSILON = 1e-8;

interface RegionSpec {
  x: number;
  y: number;
  size: number;
}

function meanAndVariance(values: Float32Array): { mean: number; variance: number } {
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i]!;
  const mean = values.length > 0 ? sum / values.length : 0;

  let sq = 0;
  for (let i = 0; i < values.length; i += 1) {
    const delta = values[i]! - mean;
    sq += delta * delta;
  }
  return { mean, variance: values.length > 0 ? sq / values.length : 0 };
}

/**
 * Correlates how two signals *vary*, not their raw levels: a non centered correlation would
 * score highly against almost any bright or gradient region, since brightness values are always
 * positive. Subtracting each series' own mean first is what makes this a real shape match.
 */
export function normalizedCrossCorrelation(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;

  const statsA = meanAndVariance(a);
  const statsB = meanAndVariance(b);
  const denominator = Math.sqrt(statsA.variance * statsB.variance) * a.length;
  if (denominator < EPSILON) return 0;

  let numerator = 0;
  for (let i = 0; i < a.length; i += 1) {
    numerator += (a[i]! - statsA.mean) * (b[i]! - statsB.mean);
  }
  return numerator / denominator;
}

export function toRegionGrayscale(imageData: ImageData, region: RegionSpec): Float32Array {
  const { width, height, data } = imageData;
  const { size } = region;
  if (size <= 0) return new Float32Array(0);
  if (region.x < 0 || region.y < 0 || region.x + size > width || region.y + size > height) {
    return new Float32Array(0);
  }

  const out = new Float32Array(size * size);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const idx = ((region.y + row) * width + (region.x + col)) * 4;
      out[row * size + col] =
        (0.2126 * data[idx]! + 0.7152 * data[idx + 1]! + 0.0722 * data[idx + 2]!) / 255;
    }
  }
  return out;
}

export function sobelMagnitude(values: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx =
        -values[i - width - 1]! - 2 * values[i - 1]! - values[i + width - 1]! +
        values[i - width + 1]! + 2 * values[i + 1]! + values[i + width + 1]!;
      const gy =
        -values[i - width - 1]! - 2 * values[i - width]! - values[i - width + 1]! +
        values[i + width - 1]! + 2 * values[i + width]! + values[i + width + 1]!;
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

/** Correlation between the region's brightness and the template's alpha: the primary signal. */
export function computeRegionSpatialCorrelation(params: {
  imageData: ImageData;
  alphaMap: Float32Array;
  region: RegionSpec;
}): number {
  const patch = toRegionGrayscale(params.imageData, params.region);
  if (patch.length === 0 || patch.length !== params.alphaMap.length) return 0;
  return normalizedCrossCorrelation(patch, params.alphaMap);
}

/**
 * Correlation between the region's edges and the template's edges: an independent signal that
 * catches a residual halo a flat brightness comparison alone would miss.
 */
export function computeRegionGradientCorrelation(params: {
  imageData: ImageData;
  alphaMap: Float32Array;
  region: RegionSpec;
}): number {
  const patch = toRegionGrayscale(params.imageData, params.region);
  if (patch.length === 0 || patch.length !== params.alphaMap.length) return 0;
  const size = params.region.size;
  if (size <= 2) return 0;

  const patchGradient = sobelMagnitude(patch, size, size);
  const alphaGradient = sobelMagnitude(params.alphaMap, size, size);
  return normalizedCrossCorrelation(patchGradient, alphaGradient);
}

/** Bilinear resample of a square alpha map to a different size, for non catalog logo sizes. */
export function interpolateAlphaMap(
  sourceAlpha: Float32Array,
  sourceSize: number,
  targetSize: number,
): Float32Array {
  if (targetSize <= 0) return new Float32Array(0);
  if (sourceSize === targetSize) return new Float32Array(sourceAlpha);

  const out = new Float32Array(targetSize * targetSize);
  const scale = (sourceSize - 1) / Math.max(1, targetSize - 1);

  for (let y = 0; y < targetSize; y += 1) {
    const sy = y * scale;
    const y0 = Math.floor(sy);
    const y1 = Math.min(sourceSize - 1, y0 + 1);
    const fy = sy - y0;

    for (let x = 0; x < targetSize; x += 1) {
      const sx = x * scale;
      const x0 = Math.floor(sx);
      const x1 = Math.min(sourceSize - 1, x0 + 1);
      const fx = sx - x0;

      const p00 = sourceAlpha[y0 * sourceSize + x0]!;
      const p10 = sourceAlpha[y0 * sourceSize + x1]!;
      const p01 = sourceAlpha[y1 * sourceSize + x0]!;
      const p11 = sourceAlpha[y1 * sourceSize + x1]!;

      const top = p00 + (p10 - p00) * fx;
      const bottom = p01 + (p11 - p01) * fx;
      out[y * targetSize + x] = top + (bottom - top) * fy;
    }
  }

  return out;
}
