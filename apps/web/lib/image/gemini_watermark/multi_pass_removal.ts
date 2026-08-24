/**
 * Repeats the reverse alpha blend a few times — a multi-layer composited mark leaves residual
 * after one pass — stopping once the residual correlation drops low enough or a pass looks
 * unsafe (pixels collapsing toward pure black).
 *
 * Loosely based on `multiPassRemoval.js` in GargantuaX/gemini-watermark-remover (MIT licensed);
 * drops its overshoot guard (rejecting a pass darker than a reference region above the mark),
 * which false-rejected valid removals whenever the real scene was unevenly lit.
 */

import { removeWatermark } from './remove_watermark';
import { calculateNearBlackRatio, cloneImageData, scoreRegion } from './restoration_metrics';
import type { WatermarkPosition } from './size_catalog';

const MAX_PASSES = 4;
const RESIDUAL_THRESHOLD = 0.25;
const MAX_NEAR_BLACK_RATIO_INCREASE = 0.05;

export interface MultiPassResult {
  imageData: ImageData;
  passCount: number;
  finalSpatialScore: number;
}

export function removeRepeatedWatermarkLayers(
  imageData: ImageData,
  alphaMap: Float32Array,
  position: WatermarkPosition,
): MultiPassResult {
  let current = cloneImageData(imageData);
  const baseNearBlackRatio = calculateNearBlackRatio(current, position);
  const maxNearBlackRatio = Math.min(1, baseNearBlackRatio + MAX_NEAR_BLACK_RATIO_INCREASE);

  let passCount = 0;
  let finalSpatialScore = scoreRegion(current, alphaMap, position).spatialScore;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const candidate = cloneImageData(current);
    removeWatermark(candidate, alphaMap, position);

    const after = scoreRegion(candidate, alphaMap, position);
    const nearBlackRatio = calculateNearBlackRatio(candidate, position);
    if (nearBlackRatio > maxNearBlackRatio) break;

    current = candidate;
    passCount += 1;
    finalSpatialScore = after.spatialScore;

    if (Math.abs(after.spatialScore) <= RESIDUAL_THRESHOLD) break;
  }

  return { imageData: current, passCount, finalSpatialScore };
}
