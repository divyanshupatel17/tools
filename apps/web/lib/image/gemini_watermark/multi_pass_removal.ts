/**
 * Repeats the reverse alpha blend up to a few times, since some Gemini output has the mark
 * composited at more than one opacity layer and a single pass leaves a faint residual behind.
 * Stops as soon as the residual correlation with the template drops low enough, or immediately
 * if a pass looks unsafe (pixels collapsing to pure black that were not already close to it).
 *
 * Loosely based on `multiPassRemoval.js` in GargantuaX/gemini-watermark-remover (MIT licensed).
 * That version also hard rejects a pass whose region ends up darker or flatter than a reference
 * region just above the mark, as a guard against overshoot. This port drops that check: it
 * depends on repair passes this port does not implement to recover a false reject, so as a bare
 * gate it only discards otherwise correct removals whenever the real scene is unevenly lit
 * around the mark (confirmed against `v1.png`, where the area above the mark is brighter than
 * the shadowed desk corner the mark actually sits on, tripping the check on a removal that had
 * already driven the residual correlation from 0.97 to 0.03).
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
