/**
 * Position catalog for the Gemini sparkle watermark on video frames, which uses different logo
 * sizes and margins than the still image catalog (`size_catalog.ts`) for the same pixel
 * dimensions: video output is re-encoded, so Gemini stamps the mark at video specific scales.
 *
 * Ported verbatim (geometry values unchanged) from `videoWatermarkCatalog.js` in
 * GargantuaX/gemini-watermark-remover (MIT licensed).
 */

export interface VideoWatermarkCandidate {
  id: string;
  label: string;
  size: number;
  width: number;
  height: number;
  marginRight: number;
  marginBottom: number;
  x: number;
  y: number;
  sourcePriority: number;
}

const REFERENCE_WIDTH = 1920;
const REFERENCE_HEIGHT = 1080;

interface ReferenceCandidateSeed {
  id: string;
  label: string;
  size: number;
  marginRight: number;
  marginBottom: number;
}

const REFERENCE_CANDIDATES: ReferenceCandidateSeed[] = [
  { id: 'veo-1080p-standard', label: '1080p standard, 72px, margin 108', size: 72, marginRight: 108, marginBottom: 108 },
  { id: 'veo-1080p-inset', label: '1080p inset, 72px, margin 144', size: 72, marginRight: 144, marginBottom: 144 },
];

const EXACT_PROJECTED_CANDIDATE_OVERRIDES_BY_SIZE: Record<
  string,
  Record<string, { id: string; label: string; sourcePriority: number }>
> = {
  '1280x720': {
    'veo-1080p-inset': { id: 'veo-720p-3-inset', label: '720p-3 inset, 48px, margin 96', sourcePriority: 0 },
    'veo-1080p-standard': { id: 'veo-720p-1-standard', label: '720p-1 standard, 48px, margin 72', sourcePriority: 1 },
  },
};

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function buildCandidate(
  seed: { id: string; label: string; size: number; marginRight: number; marginBottom: number; sourcePriority?: number },
  width: number,
  height: number,
  scale: number,
): VideoWatermarkCandidate {
  const size = clampInteger(seed.size * scale, 24, Math.min(width, height));
  const marginRight = clampInteger(seed.marginRight * scale, 0, width - size);
  const marginBottom = clampInteger(seed.marginBottom * scale, 0, height - size);
  return {
    id: seed.id,
    label: seed.label,
    size,
    width: size,
    height: size,
    marginRight,
    marginBottom,
    x: width - marginRight - size,
    y: height - marginBottom - size,
    sourcePriority: seed.sourcePriority ?? 100,
  };
}

function isCandidateInBounds(candidate: VideoWatermarkCandidate, width: number, height: number): boolean {
  return (
    candidate.x >= 0 &&
    candidate.y >= 0 &&
    candidate.x + candidate.size <= width &&
    candidate.y + candidate.size <= height
  );
}

function getProjectedReferenceCandidates(width: number, height: number): VideoWatermarkCandidate[] {
  const scale = Math.min(width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT);
  const overrides = EXACT_PROJECTED_CANDIDATE_OVERRIDES_BY_SIZE[`${width}x${height}`] ?? {};

  return REFERENCE_CANDIDATES.map((seed, index) => {
    const override = overrides[seed.id];
    return buildCandidate(
      {
        ...seed,
        id: override?.id ?? seed.id,
        label: override?.label ?? seed.label,
        sourcePriority: override?.sourcePriority ?? index,
      },
      width,
      height,
      scale,
    );
  }).filter((candidate) => isCandidateInBounds(candidate, width, height));
}

function getExplicitCandidates(width: number, height: number): VideoWatermarkCandidate[] {
  let seeds: Array<{ id: string; label: string; size: number; marginRight: number; marginBottom: number; sourcePriority: number }> = [];

  if (width === 1080 && height === 1920) {
    seeds = [
      { id: 'veo-1080x1920-portrait-72', label: '1080x1920 portrait, 72px, margin 108', size: 72, marginRight: 108, marginBottom: 108, sourcePriority: 0 },
      { id: 'veo-1080x1920-portrait-relocated-72', label: '1080x1920 portrait relocated, 72px, margin 144', size: 72, marginRight: 144, marginBottom: 144, sourcePriority: 1 },
    ];
  } else if (width === 1280 && height === 720) {
    seeds = [
      { id: 'veo-720p-2-compact', label: '720p-2 compact, 44px, margin 29/40', size: 44, marginRight: 29, marginBottom: 40, sourcePriority: 2 },
    ];
  } else if (width === 720 && height === 1280) {
    seeds = [
      { id: 'veo-720x1280-portrait-48', label: '720x1280 portrait, 48px, margin 72', size: 48, marginRight: 72, marginBottom: 72, sourcePriority: 1 },
      { id: 'veo-720x1280-portrait-relocated-48', label: '720x1280 portrait relocated, 48px, margin 96', size: 48, marginRight: 96, marginBottom: 96, sourcePriority: 0 },
      { id: 'veo-720x1280-animated-compact-24', label: '720x1280 animated compact, 24px, margin 48', size: 24, marginRight: 48, marginBottom: 48, sourcePriority: 0 },
      { id: 'veo-720x1280-vertical-inset', label: '720x1280 vertical inset, 35px, margin 102/96', size: 35, marginRight: 102, marginBottom: 96, sourcePriority: 1 },
      { id: 'veo-720x1280-compact-44', label: '720x1280 compact, 44px, margin 29/40', size: 44, marginRight: 29, marginBottom: 40, sourcePriority: 3 },
    ];
  } else {
    return [];
  }

  return seeds
    .map((seed) => buildCandidate(seed, width, height, 1))
    .filter((candidate) => isCandidateInBounds(candidate, width, height));
}

function candidateGeometryKey(candidate: VideoWatermarkCandidate): string {
  return `${candidate.size}:${candidate.marginRight}:${candidate.marginBottom}`;
}

function dedupeVideoCandidates(candidates: VideoWatermarkCandidate[]): VideoWatermarkCandidate[] {
  const bestByGeometry = new Map<string, VideoWatermarkCandidate>();
  for (const candidate of candidates) {
    const key = candidateGeometryKey(candidate);
    const existing = bestByGeometry.get(key);
    if (!existing || candidate.sourcePriority < existing.sourcePriority) {
      bestByGeometry.set(key, candidate);
    }
  }
  return [...bestByGeometry.values()].sort((left, right) => left.sourcePriority - right.sourcePriority);
}

/** All plausible watermark positions for a video (or video sourced) frame of this size. */
export function resolveVideoWatermarkCandidates(width: number, height: number): VideoWatermarkCandidate[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  return dedupeVideoCandidates([...getProjectedReferenceCandidates(width, height), ...getExplicitCandidates(width, height)]);
}
