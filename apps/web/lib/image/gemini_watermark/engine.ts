/**
 * Ties the pieces together: look up the plausible watermark positions for this image size from
 * the catalog, score each one against its real alpha template, keep the best one that clears the
 * confidence gate, and remove it with the exact inverse blend (repeated if a residual remains).
 *
 * This intentionally implements only the core pipeline described in
 * `docs/gemini_watermark_remover_approach.md` — the catalog lookup, the real templates, the
 * correlation gate and multi pass removal — not the long tail of narrowly scoped rescue passes
 * the upstream project has accumulated. See that document before extending this.
 */

import { classifyStandardWatermarkSignal } from './decision_policy';
import { computeRegionGradientCorrelation, computeRegionSpatialCorrelation, interpolateAlphaMap } from './correlation';
import { getEmbeddedAlphaMap } from './embedded_alpha_maps';
import { removeRepeatedWatermarkLayers } from './multi_pass_removal';
import {
  calculateWatermarkPosition,
  detectWatermarkConfig,
  isExactOfficialGeminiImageSize,
  resolveGeminiWatermarkSearchConfigs,
  type WatermarkConfig,
  type WatermarkPosition,
} from './size_catalog';
import { estimateFrameAlphaGain, removeWatermarkFromFrameRegion, scoreCandidateOnFrame } from './video_frame_removal';
import { resolveVideoWatermarkCandidates } from './video_size_catalog';

export interface GeminiWatermarkResult {
  imageData: ImageData;
  found: boolean;
  position: WatermarkPosition | null;
  /** How many extra removal passes ran beyond the first, for diagnostics only. */
  extraPasses: number;
}

function resolveAlphaMap(config: WatermarkConfig): Float32Array | null {
  const key = config.alphaVariant === '20260520' ? '96-20260520' : config.alphaVariant === 'v2' ? '36-v2' : String(config.logoSize);

  const embedded = getEmbeddedAlphaMap(key);
  if (embedded) return embedded;

  // No exact embedded map for this size (a near official projected candidate, most often):
  // interpolate from the closest calibrated size in the same family.
  const baseKey = config.logoSize >= 72 ? '96' : '48';
  const base = getEmbeddedAlphaMap(baseKey);
  if (!base) return null;
  const baseSize = baseKey === '96' ? 96 : 48;
  return interpolateAlphaMap(base, baseSize, config.logoSize);
}

interface ScoredCandidate {
  config: WatermarkConfig;
  position: WatermarkPosition;
  alphaMap: Float32Array;
  spatialScore: number;
  gradientScore: number;
}

function isPositionInBounds(position: WatermarkPosition, width: number, height: number): boolean {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.x + position.width <= width &&
    position.y + position.height <= height
  );
}

/** Scores every plausible catalog position and returns the best direct match, if any. */
function findBestCandidate(imageData: ImageData): ScoredCandidate | null {
  const { width, height } = imageData;
  const defaultConfig = detectWatermarkConfig(width, height);
  const configs = resolveGeminiWatermarkSearchConfigs(width, height, defaultConfig);

  let best: ScoredCandidate | null = null;

  for (const config of configs) {
    const position = calculateWatermarkPosition(width, height, config);
    if (!isPositionInBounds(position, width, height)) continue;

    const alphaMap = resolveAlphaMap(config);
    if (!alphaMap || alphaMap.length !== position.width * position.height) continue;

    const region = { x: position.x, y: position.y, size: position.width };
    const spatialScore = computeRegionSpatialCorrelation({ imageData, alphaMap, region });
    const gradientScore = computeRegionGradientCorrelation({ imageData, alphaMap, region });
    const tier = classifyStandardWatermarkSignal({ spatialScore, gradientScore });

    if (tier !== 'direct-match') continue;
    if (best && spatialScore <= best.spatialScore) continue;

    best = { config, position, alphaMap, spatialScore, gradientScore };
  }

  return best;
}

const VIDEO_FALLBACK_MIN_CONFIDENCE = 0.18;

/**
 * Falls back to the video frame catalog when nothing in the still image catalog matches: a frame
 * pulled from Gemini video output uses video specific sizes/margins (`video_size_catalog.ts`) and
 * has its watermark alpha attenuated by re encoding, so it needs a gain estimated from that
 * frame's own background rather than the still image path's fixed strength blend.
 */
function findBestVideoCandidate(imageData: ImageData) {
  const candidates = resolveVideoWatermarkCandidates(imageData.width, imageData.height);

  let best: ReturnType<typeof scoreCandidateOnFrame> | null = null;
  for (const candidate of candidates) {
    const scored = scoreCandidateOnFrame(imageData, candidate);
    if (scored.confidence < VIDEO_FALLBACK_MIN_CONFIDENCE) continue;
    if (best && scored.confidence <= best.confidence) continue;
    best = scored;
  }

  return best;
}

function removeWithVideoCandidate(
  imageData: ImageData,
  videoCandidate: ReturnType<typeof scoreCandidateOnFrame>,
): GeminiWatermarkResult {
  const position = {
    x: videoCandidate.candidate.x,
    y: videoCandidate.candidate.y,
    width: videoCandidate.candidate.width,
    height: videoCandidate.candidate.height,
  };
  const gain = estimateFrameAlphaGain(imageData, position, videoCandidate.alphaMap);
  const result = removeWatermarkFromFrameRegion(imageData, position, videoCandidate.alphaMap, gain);
  return { imageData: result, found: true, position, extraPasses: 0 };
}

/**
 * Detects and removes the Gemini sparkle watermark from `imageData` (mutated copies only; the
 * input is never modified). Returns the original pixels unchanged, with `found: false`, when
 * nothing in either catalog clears its confidence gate — this never forces a guess.
 *
 * The still image catalog only ever contains Gemini's own official output sizes exactly; for any
 * other size (most often a frame pulled from a Gemini video) its "match" is a projected guess
 * that can land close enough to a real, but differently attenuated, video watermark to pass the
 * direct match gate and then over subtract at the still image path's fixed strength. So an exact
 * catalog size trusts the still image path outright, but anything else prefers the video path
 * (which estimates its own blend strength from the image) whenever it also finds a match.
 */
export function removeGeminiWatermark(imageData: ImageData): GeminiWatermarkResult {
  const { width, height } = imageData;
  const isExactStillImageSize = isExactOfficialGeminiImageSize(width, height);

  if (isExactStillImageSize) {
    const candidate = findBestCandidate(imageData);
    if (candidate) {
      const result = removeRepeatedWatermarkLayers(imageData, candidate.alphaMap, candidate.position);
      return {
        imageData: result.imageData,
        found: true,
        position: candidate.position,
        extraPasses: Math.max(0, result.passCount - 1),
      };
    }
    const videoCandidate = findBestVideoCandidate(imageData);
    if (videoCandidate) return removeWithVideoCandidate(imageData, videoCandidate);
    return { imageData, found: false, position: null, extraPasses: 0 };
  }

  const videoCandidate = findBestVideoCandidate(imageData);
  if (videoCandidate) return removeWithVideoCandidate(imageData, videoCandidate);

  const candidate = findBestCandidate(imageData);
  if (candidate) {
    const result = removeRepeatedWatermarkLayers(imageData, candidate.alphaMap, candidate.position);
    return {
      imageData: result.imageData,
      found: true,
      position: candidate.position,
      extraPasses: Math.max(0, result.passCount - 1),
    };
  }

  return { imageData, found: false, position: null, extraPasses: 0 };
}
