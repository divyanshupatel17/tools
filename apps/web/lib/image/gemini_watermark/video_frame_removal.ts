/**
 * Per frame detection and removal for video sourced Gemini watermarks: scores every video
 * catalog candidate against a frame, and removes the chosen one using an alpha gain estimated
 * fresh from that frame's own background luma rather than a fixed strength.
 *
 * Video re encoding (deblocking, chroma subsampling, bitrate ladders) attenuates the mark's real
 * alpha, so the still image path's fixed strength inverse blend (`remove_watermark.ts`) over
 * subtracts on a video sourced frame and clips the result toward black. This adaptive gain search
 * is what the reference project uses instead for anything that came out of a video.
 *
 * Ported from the relevant parts of `videoWatermarkDetector.js` in
 * GargantuaX/gemini-watermark-remover (MIT licensed): `scoreCandidateOnFrame`,
 * `estimateFrameAlphaGain`, `computeBackgroundMeanFromImageData`, `scoreGainAgainstBackground`,
 * `createRestoredVideoRoi`.
 */

import { computeRegionGradientCorrelation, computeRegionSpatialCorrelation } from './correlation';
import { getVideoAlphaMap } from './video_alpha';
import type { VideoWatermarkCandidate } from './video_size_catalog';

const LOGO_VALUE = 255;
const ALPHA_REFINEMENT_ROUNDS = 5;
const DEFAULT_ALPHA_SEED_GAIN = 1;

export interface VideoCandidateScore {
  candidate: VideoWatermarkCandidate;
  alphaMap: Float32Array;
  spatial: number;
  gradient: number;
  confidence: number;
}

/** Weighted blend the reference project uses to rank video candidates: gradient led. */
export function scoreCandidateOnFrame(imageData: ImageData, candidate: VideoWatermarkCandidate): VideoCandidateScore {
  const alphaMap = getVideoAlphaMap(candidate);
  const region = { x: candidate.x, y: candidate.y, size: candidate.size };
  const spatial = computeRegionSpatialCorrelation({ imageData, alphaMap, region });
  const gradient = computeRegionGradientCorrelation({ imageData, alphaMap, region });
  const confidence = Math.max(0, spatial) * 0.35 + Math.max(0, gradient) * 0.65;
  return { candidate, alphaMap, spatial, gradient, confidence };
}

function lumaAt(data: Uint8ClampedArray, idx: number): number {
  return 0.2126 * data[idx]! + 0.7152 * data[idx + 1]! + 0.0722 * data[idx + 2]!;
}

/** Mean luma of the pixels around the watermark box, weighted down over its own low alpha edge. */
function computeBackgroundMeanFromImageData(
  imageData: ImageData,
  position: { x: number; y: number; width: number; height: number },
  alphaMap: Float32Array,
  padding = 18,
): number | null {
  const padX = Math.max(0, position.x - padding);
  const padY = Math.max(0, position.y - padding);
  const padRight = Math.min(imageData.width, position.x + position.width + padding);
  const padBottom = Math.min(imageData.height, position.y + position.height + padding);

  let sum = 0;
  let weightSum = 0;
  const lowAlphaThreshold = 0.015;

  for (let y = padY; y < padBottom; y += 1) {
    for (let x = padX; x < padRight; x += 1) {
      const inRoi = x >= position.x && x < position.x + position.width && y >= position.y && y < position.y + position.height;

      let weight = inRoi ? 0 : 1;
      if (inRoi) {
        const rx = x - position.x;
        const ry = y - position.y;
        const alpha = alphaMap[ry * position.width + rx] ?? 0;
        if (alpha <= lowAlphaThreshold) weight = 0.35;
      }
      if (weight <= 0) continue;

      const idx = (y * imageData.width + x) * 4;
      sum += lumaAt(imageData.data, idx) * weight;
      weightSum += weight;
    }
  }

  return weightSum > 0 ? sum / weightSum : null;
}

/** How far a candidate gain's restored luma sits from the surrounding background's luma. */
function scoreGainAgainstBackground(
  imageData: ImageData,
  position: { x: number; y: number; width: number; height: number },
  alphaMap: Float32Array,
  gain: number,
  backgroundMean: number,
): number | null {
  let sum = 0;
  let weightSum = 0;
  for (let y = 0; y < position.height; y += 1) {
    for (let x = 0; x < position.width; x += 1) {
      const rawAlpha = alphaMap[y * position.width + x] ?? 0;
      if (rawAlpha <= 0.025) continue;

      const alpha = Math.min(rawAlpha * gain, 0.99);
      const oneMinusAlpha = 1 - alpha;
      const idx = ((position.y + y) * imageData.width + position.x + x) * 4;
      const weight = Math.min(1, Math.max(0, rawAlpha * 8));

      const r = (imageData.data[idx]! - alpha * LOGO_VALUE) / oneMinusAlpha;
      const g = (imageData.data[idx + 1]! - alpha * LOGO_VALUE) / oneMinusAlpha;
      const b = (imageData.data[idx + 2]! - alpha * LOGO_VALUE) / oneMinusAlpha;
      sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) * weight;
      weightSum += weight;
    }
  }

  if (weightSum <= 0) return null;
  return sum / weightSum - backgroundMean;
}

/**
 * Bisects the alpha gain that makes the restored region's luma match its surrounding background,
 * instead of assuming the mark was stamped at full calibrated strength.
 */
export function estimateFrameAlphaGain(
  imageData: ImageData,
  position: { x: number; y: number; width: number; height: number },
  alphaMap: Float32Array,
  seedGain = DEFAULT_ALPHA_SEED_GAIN,
): number {
  const backgroundMean = computeBackgroundMeanFromImageData(imageData, position, alphaMap);
  if (backgroundMean === null) return seedGain;

  let lo = Math.max(0.35, seedGain - 0.45);
  let hi = Math.min(1.35, seedGain + 0.45);
  let bestGain = seedGain;
  let bestAbsDelta = Number.POSITIVE_INFINITY;

  for (let i = 0; i < ALPHA_REFINEMENT_ROUNDS; i += 1) {
    const gain = (lo + hi) / 2;
    const delta = scoreGainAgainstBackground(imageData, position, alphaMap, gain, backgroundMean);
    if (delta === null) return seedGain;

    const absDelta = Math.abs(delta);
    if (absDelta < bestAbsDelta) {
      bestAbsDelta = absDelta;
      bestGain = gain;
    }

    if (delta > 0) lo = gain;
    else hi = gain;
  }

  return bestGain;
}

/** Reverse alpha blend over one frame's watermark region, using an already estimated gain. */
export function removeWatermarkFromFrameRegion(
  imageData: ImageData,
  position: { x: number; y: number; width: number; height: number },
  alphaMap: Float32Array,
  alphaGain: number,
): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);

  for (let y = 0; y < position.height; y += 1) {
    for (let x = 0; x < position.width; x += 1) {
      const rawAlpha = alphaMap[y * position.width + x] ?? 0;
      const alpha = rawAlpha > 0.025 ? Math.min(rawAlpha * alphaGain, 0.99) : 0;
      if (alpha <= 0) continue;

      const idx = ((position.y + y) * imageData.width + (position.x + x)) * 4;
      const oneMinusAlpha = 1 - alpha;
      out.data[idx] = clampChannel((imageData.data[idx]! - alpha * LOGO_VALUE) / oneMinusAlpha);
      out.data[idx + 1] = clampChannel((imageData.data[idx + 1]! - alpha * LOGO_VALUE) / oneMinusAlpha);
      out.data[idx + 2] = clampChannel((imageData.data[idx + 2]! - alpha * LOGO_VALUE) / oneMinusAlpha);
    }
  }

  return out;
}

function clampChannel(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}
