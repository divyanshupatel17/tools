/**
 * Builds an alpha template for a video candidate's logo size from the same calibrated base maps
 * the still image path uses (`embedded_alpha_maps.ts`), resized by area averaging — not bilinear
 * point sampling like `interpolateAlphaMap`, which loses too much shape at these smaller sizes.
 *
 * Ported from `videoWatermarkDetector.js` in GargantuaX/gemini-watermark-remover (MIT licensed).
 */

import { getEmbeddedAlphaMap } from './embedded_alpha_maps';
import type { VideoWatermarkCandidate } from './video_size_catalog';

const VIDEO_ALPHA_PROFILE = '96-20260520';
const VIDEO_ALPHA_EDGE_BOOST = 0.045;
const VIDEO_INSET_ALPHA_EDGE_BOOST = 0.035;
const AUTO_ALPHA_SHAPE_MIN_SIZE = 40;
const VIDEO_V1_ALPHA_MAX_SIZE = AUTO_ALPHA_SHAPE_MIN_SIZE - 1;

function inferSquareAlphaSize(alphaMap: Float32Array, fallbackSize: number): number {
  const size = Math.round(Math.sqrt(alphaMap.length));
  return size > 0 && size * size === alphaMap.length ? size : fallbackSize;
}

/** Area weighted resample of a square alpha map, used for the video sized (small) targets. */
export function resizeAlphaMapArea(sourceAlpha: Float32Array, sourceSize: number, targetSize: number): Float32Array {
  if (targetSize <= 0) return new Float32Array(0);
  if (sourceSize === targetSize) return new Float32Array(sourceAlpha);

  const out = new Float32Array(targetSize * targetSize);
  const scale = sourceSize / targetSize;

  for (let y = 0; y < targetSize; y += 1) {
    const yStart = y * scale;
    const yEnd = (y + 1) * scale;
    const y0 = Math.floor(yStart);
    const y1 = Math.ceil(yEnd);

    for (let x = 0; x < targetSize; x += 1) {
      const xStart = x * scale;
      const xEnd = (x + 1) * scale;
      const x0 = Math.floor(xStart);
      const x1 = Math.ceil(xEnd);

      let sum = 0;
      let areaSum = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        if (sy < 0 || sy >= sourceSize) continue;
        const wy = Math.max(0, Math.min(yEnd, sy + 1) - Math.max(yStart, sy));
        for (let sx = x0; sx < x1; sx += 1) {
          if (sx < 0 || sx >= sourceSize) continue;
          const wx = Math.max(0, Math.min(xEnd, sx + 1) - Math.max(xStart, sx));
          const area = wx * wy;
          sum += sourceAlpha[sy * sourceSize + sx]! * area;
          areaSum += area;
        }
      }

      out[y * targetSize + x] = areaSum > 0 ? sum / areaSum : 0;
    }
  }

  return out;
}

/** Video candidates near square inset margins (roughly 2x their size) use a gentler edge boost. */
export function resolveVideoAlphaEdgeBoost(candidate: VideoWatermarkCandidate | null): number {
  const size = candidate?.size ?? 0;
  const isInsetByGeometry =
    size > 0 &&
    candidate!.marginRight / size >= 1.85 &&
    candidate!.marginBottom / size >= 1.85;

  if (candidate?.id === 'veo-1080p-inset' || isInsetByGeometry) return VIDEO_INSET_ALPHA_EDGE_BOOST;
  return VIDEO_ALPHA_EDGE_BOOST;
}

function enhanceVideoAlphaEdges(alphaMap: Float32Array, size: number, strength: number): Float32Array {
  if (!Number.isFinite(strength) || strength <= 0 || size <= 2) return new Float32Array(alphaMap);

  const gradient = new Float32Array(alphaMap.length);
  let maxGradient = 0;

  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const i = y * size + x;
      const gx =
        -alphaMap[i - size - 1]! - 2 * alphaMap[i - 1]! - alphaMap[i + size - 1]! +
        alphaMap[i - size + 1]! + 2 * alphaMap[i + 1]! + alphaMap[i + size + 1]!;
      const gy =
        -alphaMap[i - size - 1]! - 2 * alphaMap[i - size]! - alphaMap[i - size + 1]! +
        alphaMap[i + size - 1]! + 2 * alphaMap[i + size]! + alphaMap[i + size + 1]!;
      const value = Math.sqrt(gx * gx + gy * gy);
      gradient[i] = value;
      if (value > maxGradient) maxGradient = value;
    }
  }

  if (maxGradient <= 0) return new Float32Array(alphaMap);

  const out = new Float32Array(alphaMap.length);
  for (let i = 0; i < alphaMap.length; i += 1) {
    const edge = Math.sqrt(gradient[i]! / maxGradient);
    out[i] = Math.min(0.99, alphaMap[i]! + edge * strength);
  }
  return out;
}

/** Resolves the alpha template for a video watermark candidate's exact logo size. */
export function getVideoAlphaMap(candidate: VideoWatermarkCandidate): Float32Array {
  const profile = candidate.size <= VIDEO_V1_ALPHA_MAX_SIZE ? '48' : VIDEO_ALPHA_PROFILE;
  const alphaSource = getEmbeddedAlphaMap(profile) ?? getEmbeddedAlphaMap(VIDEO_ALPHA_PROFILE) ?? getEmbeddedAlphaMap('96');
  if (!alphaSource) throw new Error('Missing base Gemini alpha map for video watermark template');

  const sourceSize = inferSquareAlphaSize(alphaSource, 96);
  const edgeBoost = resolveVideoAlphaEdgeBoost(candidate);
  const resized =
    candidate.size === sourceSize ? new Float32Array(alphaSource) : resizeAlphaMapArea(alphaSource, sourceSize, candidate.size);
  return enhanceVideoAlphaEdges(resized, candidate.size, edgeBoost);
}
