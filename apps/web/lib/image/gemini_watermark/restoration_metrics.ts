/**
 * Small metrics used to judge a removal result: how correlated the region still is with the
 * template, and whether pixels have collapsed to pure black beyond what the original image
 * already had (the one universal, scene independent sign of an unsafe over-subtraction).
 *
 * Ported from the relevant parts of `restorationMetrics.js` in
 * GargantuaX/gemini-watermark-remover (MIT licensed).
 */

import { computeRegionGradientCorrelation, computeRegionSpatialCorrelation } from './correlation';
import type { WatermarkPosition } from './size_catalog';

const NEAR_BLACK_THRESHOLD = 5;

export function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

export function calculateNearBlackRatio(imageData: ImageData, position: WatermarkPosition): number {
  let nearBlack = 0;
  let total = 0;
  for (let row = 0; row < position.height; row += 1) {
    for (let col = 0; col < position.width; col += 1) {
      const idx = ((position.y + row) * imageData.width + (position.x + col)) * 4;
      const r = imageData.data[idx]!;
      const g = imageData.data[idx + 1]!;
      const b = imageData.data[idx + 2]!;
      if (r <= NEAR_BLACK_THRESHOLD && g <= NEAR_BLACK_THRESHOLD && b <= NEAR_BLACK_THRESHOLD) {
        nearBlack += 1;
      }
      total += 1;
    }
  }
  return total > 0 ? nearBlack / total : 0;
}

export interface RegionScore {
  spatialScore: number;
  gradientScore: number;
}

export function scoreRegion(
  imageData: ImageData,
  alphaMap: Float32Array,
  position: WatermarkPosition,
): RegionScore {
  const region = { x: position.x, y: position.y, size: position.width };
  return {
    spatialScore: computeRegionSpatialCorrelation({ imageData, alphaMap, region }),
    gradientScore: computeRegionGradientCorrelation({ imageData, alphaMap, region }),
  };
}
