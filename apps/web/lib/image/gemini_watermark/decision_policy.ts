/**
 * Confidence gate for a candidate position: is the correlation strong enough to say a
 * watermark was actually found here, or is this just an ordinary bright or textured region.
 *
 * Ported from `watermarkDecisionPolicy.js` in GargantuaX/gemini-watermark-remover (MIT
 * licensed), keeping only the standard (catalog based) signal classification; the adaptive
 * (generic sliding search) and attribution tiers are part of the deferred rescue tail.
 */

const DIRECT_MATCH_MIN_SPATIAL_SCORE = 0.3;
const DIRECT_MATCH_MIN_GRADIENT_SCORE = 0.12;
const STRONG_GRADIENT_DIRECT_MATCH_MIN_SPATIAL_SCORE = 0.295;
const STRONG_GRADIENT_DIRECT_MATCH_MIN_GRADIENT_SCORE = 0.45;

export type WatermarkSignalTier = 'direct-match' | 'needs-validation' | 'insufficient';

export function classifyStandardWatermarkSignal(params: {
  spatialScore: number;
  gradientScore: number;
}): WatermarkSignalTier {
  const { spatialScore, gradientScore } = params;

  if (
    (spatialScore >= DIRECT_MATCH_MIN_SPATIAL_SCORE && gradientScore >= DIRECT_MATCH_MIN_GRADIENT_SCORE) ||
    (spatialScore >= STRONG_GRADIENT_DIRECT_MATCH_MIN_SPATIAL_SCORE &&
      gradientScore >= STRONG_GRADIENT_DIRECT_MATCH_MIN_GRADIENT_SCORE)
  ) {
    return 'direct-match';
  }

  if (spatialScore > 0 || gradientScore > 0) return 'needs-validation';
  return 'insufficient';
}
