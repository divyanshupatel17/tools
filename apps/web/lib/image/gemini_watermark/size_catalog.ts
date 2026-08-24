/**
 * Gemini's official output size catalog and the watermark geometry each size carries.
 * Ported from `geminiSizeCatalog.js` in GargantuaX/gemini-watermark-remover (MIT licensed).
 *
 * Gemini renders at a small, fixed set of official output dimensions where watermark size and
 * margin are a deterministic function of the size used, rather than a position found by
 * scanning — plus a handful of known alternate configs Gemini has been observed to use for the
 * same official size.
 */

export interface WatermarkConfig {
  logoSize: number;
  marginRight: number;
  marginBottom: number;
  /** Which embedded alpha map to use. Undefined means the plain size keyed map (48 or 96). */
  alphaVariant?: '20260520' | 'v2';
}

export interface WatermarkPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OfficialSizeEntry {
  modelFamily: 'gemini-3.x-image' | 'gemini-2.5-flash-image';
  resolutionTier: '0.5k' | '1k' | '2k' | '2k-new-margin' | '4k';
  width: number;
  height: number;
}

const WATERMARK_CONFIG_BY_TIER: Record<OfficialSizeEntry['resolutionTier'], WatermarkConfig> = {
  '0.5k': { logoSize: 48, marginRight: 32, marginBottom: 32 },
  '1k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
  '2k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
  '4k': { logoSize: 96, marginRight: 64, marginBottom: 64 },
  '2k-new-margin': { logoSize: 96, marginRight: 192, marginBottom: 192, alphaVariant: '20260520' },
};

const GEMINI_3X_CURRENT_1K_WATERMARK_CONFIG: WatermarkConfig = {
  logoSize: 48,
  marginRight: 32,
  marginBottom: 32,
};
const GEMINI_3X_LEGACY_1K_WATERMARK_CONFIG: WatermarkConfig = {
  logoSize: 96,
  marginRight: 64,
  marginBottom: 64,
};
const GEMINI_3X_CURRENT_1K_LARGE_MARGIN_WATERMARK_CONFIG: WatermarkConfig = {
  logoSize: 48,
  marginRight: 96,
  marginBottom: 96,
};
const GEMINI_3X_V2_SMALL_WATERMARK_CONFIG: WatermarkConfig = {
  logoSize: 36,
  marginRight: 96,
  marginBottom: 96,
  alphaVariant: 'v2',
};

function createEntries(
  modelFamily: OfficialSizeEntry['modelFamily'],
  resolutionTier: OfficialSizeEntry['resolutionTier'],
  rows: readonly (readonly [string, number, number])[],
): OfficialSizeEntry[] {
  return rows.map(([, width, height]) => ({ modelFamily, resolutionTier, width, height }));
}

const OFFICIAL_GEMINI_IMAGE_SIZES: readonly OfficialSizeEntry[] = [
  ...createEntries('gemini-3.x-image', '0.5k', [
    ['1:1', 512, 512],
    ['1:4', 256, 1024],
    ['1:8', 192, 1536],
    ['2:3', 424, 632],
    ['3:2', 632, 424],
    ['3:4', 448, 600],
    ['4:1', 1024, 256],
    ['4:3', 600, 448],
    ['4:5', 464, 576],
    ['5:4', 576, 464],
    ['8:1', 1536, 192],
    ['9:16', 384, 688],
    ['16:9', 688, 384],
    ['21:9', 792, 168],
  ]),
  ...createEntries('gemini-3.x-image', '1k', [
    ['1:1', 1024, 1024],
    ['1:4', 512, 2048],
    ['1:8', 384, 3072],
    ['2:3', 848, 1264],
    ['3:2', 1264, 848],
    ['3:4', 896, 1200],
    ['4:1', 2048, 512],
    ['4:3', 1200, 896],
    ['4:5', 928, 1152],
    ['5:4', 1152, 928],
    ['8:1', 3072, 384],
    ['9:16', 768, 1376],
    ['16:9', 1376, 768],
    ['16:9', 1408, 768],
    ['21:9', 1584, 672],
  ]),
  ...createEntries('gemini-3.x-image', '2k', [
    ['1:1', 2048, 2048],
    ['1:4', 1024, 4096],
    ['1:8', 768, 6144],
    ['2:3', 1696, 2528],
    ['3:2', 2528, 1696],
    ['3:4', 1792, 2400],
    ['4:1', 4096, 1024],
    ['4:3', 2400, 1792],
    ['4:5', 1856, 2304],
    ['5:4', 2304, 1856],
    ['8:1', 6144, 768],
    ['9:16', 1536, 2752],
    ['16:9', 2752, 1536],
    ['21:9', 3168, 1344],
  ]),
  ...createEntries('gemini-3.x-image', '2k-new-margin', [['16:9', 2816, 1536]]),
  ...createEntries('gemini-3.x-image', '4k', [
    ['1:1', 4096, 4096],
    ['1:4', 2048, 8192],
    ['1:8', 1536, 12288],
    ['2:3', 3392, 5056],
    ['3:2', 5056, 3392],
    ['3:4', 3584, 4800],
    ['4:1', 8192, 2048],
    ['4:3', 4800, 3584],
    ['4:5', 3712, 4608],
    ['5:4', 4608, 3712],
    ['8:1', 12288, 1536],
    ['9:16', 3072, 5504],
    ['16:9', 5504, 3072],
    ['21:9', 6336, 2688],
  ]),
  ...createEntries('gemini-2.5-flash-image', '1k', [
    ['1:1', 1024, 1024],
    ['2:3', 832, 1248],
    ['3:2', 1248, 832],
    ['3:4', 864, 1184],
    ['4:3', 1184, 864],
    ['4:5', 896, 1152],
    ['5:4', 1152, 896],
    ['9:16', 768, 1344],
    ['16:9', 1344, 768],
    ['21:9', 1536, 672],
  ]),
];

const OFFICIAL_GEMINI_IMAGE_SIZE_INDEX = new Map<string, OfficialSizeEntry>();
for (const entry of OFFICIAL_GEMINI_IMAGE_SIZES) {
  const key = `${entry.width}x${entry.height}`;
  if (!OFFICIAL_GEMINI_IMAGE_SIZE_INDEX.has(key)) OFFICIAL_GEMINI_IMAGE_SIZE_INDEX.set(key, entry);
}

/** One exact-pixel exception Gemini 3.x has been observed to use at 1408x768. */
const KNOWN_FIXED_GEMINI_WATERMARK_CONFIGS_BY_SIZE: Record<string, readonly WatermarkConfig[]> = {
  '1408x768': [{ logoSize: 46, marginRight: 32, marginBottom: 32 }],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeDimension(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

function getEntryConfig(entry: OfficialSizeEntry): WatermarkConfig {
  if (entry.modelFamily === 'gemini-3.x-image' && entry.resolutionTier === '1k') {
    return GEMINI_3X_CURRENT_1K_WATERMARK_CONFIG;
  }
  return WATERMARK_CONFIG_BY_TIER[entry.resolutionTier];
}

function getEntryLegacyConfigs(entry: OfficialSizeEntry | null): readonly WatermarkConfig[] {
  if (entry?.modelFamily === 'gemini-3.x-image' && entry.resolutionTier === '1k') {
    return [GEMINI_3X_LEGACY_1K_WATERMARK_CONFIG];
  }
  return [];
}

function buildConfigKey(config: WatermarkConfig): string {
  return `${config.logoSize}:${config.marginRight}:${config.marginBottom}:${config.alphaVariant ?? 'default'}`;
}

function fitsInBounds(config: WatermarkConfig, width: number, height: number): boolean {
  const x = width - config.marginRight - config.logoSize;
  const y = height - config.marginBottom - config.logoSize;
  return x >= 0 && y >= 0;
}

function createCurrentLargeMarginVariantConfig(
  baseConfig: WatermarkConfig | null,
  width: number,
  height: number,
  options: { allowAnyBase?: boolean } = {},
): WatermarkConfig | null {
  if (!options.allowAnyBase && (!baseConfig || baseConfig.logoSize !== 48)) return null;
  if (baseConfig?.marginRight === 96 && baseConfig?.marginBottom === 96) return null;

  const config = { ...GEMINI_3X_CURRENT_1K_LARGE_MARGIN_WATERMARK_CONFIG };
  return fitsInBounds(config, width, height) ? config : null;
}

function createNewMarginVariantConfig(
  baseConfig: WatermarkConfig | null,
  width: number,
  height: number,
): WatermarkConfig | null {
  if (!baseConfig || baseConfig.logoSize !== 96) return null;
  if (baseConfig.marginRight === 192 && baseConfig.marginBottom === 192) return null;

  const config: WatermarkConfig = {
    logoSize: 96,
    marginRight: 192,
    marginBottom: 192,
    alphaVariant: '20260520',
  };
  return fitsInBounds(config, width, height) ? config : null;
}

function createUnknownSizeNewMarginVariantConfig(
  baseConfig: WatermarkConfig | null,
  width: number,
  height: number,
): WatermarkConfig | null {
  if (!baseConfig || baseConfig.logoSize !== 96) return null;
  if (Math.min(width, height) < 1024) return null;
  return createNewMarginVariantConfig(baseConfig, width, height);
}

function createV2SmallVariantConfig(width: number, height: number): WatermarkConfig | null {
  const normalizedWidth = normalizeDimension(width);
  const normalizedHeight = normalizeDimension(height);
  if (!normalizedWidth || !normalizedHeight) return null;
  if (Math.max(normalizedWidth, normalizedHeight) > 2048) return null;

  const longSide = Math.max(normalizedWidth, normalizedHeight);
  const shortSide = Math.min(normalizedWidth, normalizedHeight);
  const sourceLongDim = shortSide >= 566 ? 2752 : shortSide >= 550 ? 2816 : 2848;
  const margin = Math.round(192 * (longSide / sourceLongDim));
  const config: WatermarkConfig = {
    ...GEMINI_3X_V2_SMALL_WATERMARK_CONFIG,
    marginRight: margin,
    marginBottom: margin,
  };
  return fitsInBounds(config, normalizedWidth, normalizedHeight) ? config : null;
}

function createProjectedConfig(
  baseConfig: WatermarkConfig,
  scaleX: number,
  scaleY: number,
  options: { minLogoSize: number; maxLogoSize: number; roundLogoSize: (value: number) => number },
): WatermarkConfig {
  return {
    logoSize: clamp(
      options.roundLogoSize(baseConfig.logoSize * ((scaleX + scaleY) / 2)),
      options.minLogoSize,
      options.maxLogoSize,
    ),
    marginRight: Math.max(8, Math.round(baseConfig.marginRight * scaleX)),
    marginBottom: Math.max(8, Math.round(baseConfig.marginBottom * scaleY)),
    ...(baseConfig.alphaVariant ? { alphaVariant: baseConfig.alphaVariant } : {}),
  };
}

function matchOfficialGeminiImageSize(width: number, height: number): OfficialSizeEntry | null {
  const normalizedWidth = normalizeDimension(width);
  const normalizedHeight = normalizeDimension(height);
  if (!normalizedWidth || !normalizedHeight) return null;
  return OFFICIAL_GEMINI_IMAGE_SIZE_INDEX.get(`${normalizedWidth}x${normalizedHeight}`) ?? null;
}

/** Whether `width x height` is one of Gemini's own official still image output sizes exactly. */
export function isExactOfficialGeminiImageSize(width: number, height: number): boolean {
  return matchOfficialGeminiImageSize(width, height) !== null;
}

export function resolveOfficialGeminiWatermarkConfig(
  width: number,
  height: number,
): WatermarkConfig | null {
  const match = matchOfficialGeminiImageSize(width, height);
  return match ? getEntryConfig(match) : null;
}

/**
 * Gemini's historical default: both dimensions over 1024 gets the larger legacy watermark,
 * otherwise the current small one. Only used when the size is not in the official catalog at
 * all — every catalog hit uses `resolveOfficialGeminiWatermarkConfig` instead.
 */
export function detectWatermarkConfig(width: number, height: number): WatermarkConfig {
  const officialConfig = resolveOfficialGeminiWatermarkConfig(width, height);
  if (officialConfig) return officialConfig;

  if (width > 1024 && height > 1024) {
    return { logoSize: 96, marginRight: 64, marginBottom: 64 };
  }
  return { logoSize: 48, marginRight: 32, marginBottom: 32 };
}

export function calculateWatermarkPosition(
  width: number,
  height: number,
  config: WatermarkConfig,
): WatermarkPosition {
  return {
    x: width - config.marginRight - config.logoSize,
    y: height - config.marginBottom - config.logoSize,
    width: config.logoSize,
    height: config.logoSize,
  };
}

interface RankedConfigEntry {
  config: WatermarkConfig;
  /** Lower sorts first. */
  priority: number;
}

function dedupeRanked(entries: readonly RankedConfigEntry[]): WatermarkConfig[] {
  const seen = new Set<string>();
  const out: WatermarkConfig[] = [];
  for (const entry of entries) {
    const key = buildConfigKey(entry.config);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry.config);
  }
  return out;
}

function resolveKnownFixedConfigs(width: number, height: number): WatermarkConfig[] {
  const normalizedWidth = normalizeDimension(width);
  const normalizedHeight = normalizeDimension(height);
  if (!normalizedWidth || !normalizedHeight) return [];
  const configs = KNOWN_FIXED_GEMINI_WATERMARK_CONFIGS_BY_SIZE[`${normalizedWidth}x${normalizedHeight}`];
  return configs ? configs.map((config) => ({ ...config })) : [];
}

/**
 * Ranked list of watermark configs plausible for an exact catalog match: the config itself,
 * plus known alternates Gemini has used for the same official size (a large margin variant, the
 * v2 small watermark, the legacy 96px era), most likely first.
 */
function resolveOfficialSearchConfigs(
  width: number,
  height: number,
  options: { maxRelativeAspectRatioDelta?: number; maxScaleMismatchRatio?: number; minLogoSize?: number; maxLogoSize?: number; limit?: number } = {},
): WatermarkConfig[] {
  const {
    maxRelativeAspectRatioDelta = 0.02,
    maxScaleMismatchRatio = 0.12,
    minLogoSize = 24,
    maxLogoSize = 192,
    limit = 3,
  } = options;

  const normalizedWidth = normalizeDimension(width);
  const normalizedHeight = normalizeDimension(height);
  if (!normalizedWidth || !normalizedHeight) return [];

  const exactMatch = matchOfficialGeminiImageSize(normalizedWidth, normalizedHeight);
  const exactOfficialConfig = exactMatch ? getEntryConfig(exactMatch) : null;

  if (exactMatch && exactOfficialConfig) {
    const entries: RankedConfigEntry[] = [{ config: { ...exactOfficialConfig }, priority: 0 }];
    const is1k = exactMatch.modelFamily === 'gemini-3.x-image' && exactMatch.resolutionTier === '1k';

    if (is1k) {
      const largeMargin = createCurrentLargeMarginVariantConfig(exactOfficialConfig, normalizedWidth, normalizedHeight);
      if (largeMargin) entries.push({ config: largeMargin, priority: 1 });

      const v2Small = createV2SmallVariantConfig(normalizedWidth, normalizedHeight);
      if (v2Small) entries.push({ config: v2Small, priority: 2 });
    }

    for (const legacyConfig of getEntryLegacyConfigs(exactMatch)) {
      entries.push({ config: { ...legacyConfig }, priority: 3 });
    }

    if (!is1k) {
      const newMargin = createNewMarginVariantConfig(exactOfficialConfig, normalizedWidth, normalizedHeight);
      if (newMargin) entries.push({ config: newMargin, priority: 3 });
    }

    return dedupeRanked(entries);
  }

  // Near official exports are often a uniform scale of one known size. Project the known
  // watermark geometry into the new dimensions rather than falling back to a ratio heuristic.
  const targetAspectRatio = normalizedWidth / normalizedHeight;
  const projected: { config: WatermarkConfig; score: number }[] = [];

  for (const entry of OFFICIAL_GEMINI_IMAGE_SIZES) {
    const baseConfig = getEntryConfig(entry);
    const scaleX = normalizedWidth / entry.width;
    const scaleY = normalizedHeight / entry.height;
    const scale = (scaleX + scaleY) / 2;
    const entryAspectRatio = entry.width / entry.height;
    const relativeAspectRatioDelta = Math.abs(targetAspectRatio - entryAspectRatio) / entryAspectRatio;
    const scaleMismatchRatio = Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY);

    if (relativeAspectRatioDelta > maxRelativeAspectRatioDelta) continue;
    if (scaleMismatchRatio > maxScaleMismatchRatio) continue;

    const config = createProjectedConfig(baseConfig, scaleX, scaleY, {
      minLogoSize,
      maxLogoSize,
      roundLogoSize: Math.round,
    });
    if (!fitsInBounds(config, normalizedWidth, normalizedHeight)) continue;

    projected.push({
      config,
      score: relativeAspectRatioDelta * 100 + scaleMismatchRatio * 20 + Math.abs(Math.log2(Math.max(scale, 1e-6))),
    });
  }

  projected.sort((a, b) => a.score - b.score);
  const deduped = dedupeRanked(projected.map((item, index) => ({ config: item.config, priority: index })));
  return deduped.slice(0, limit);
}

/**
 * Every watermark config worth trying for an image of this size, most likely first: the coarse
 * default, any exact size catalog matches and their known alternates, and (for sizes the catalog
 * does not recognise) a couple of generic large margin / new margin variants.
 */
export function resolveGeminiWatermarkSearchConfigs(
  width: number,
  height: number,
  defaultConfig: WatermarkConfig,
): WatermarkConfig[] {
  const entries: RankedConfigEntry[] = [{ config: defaultConfig, priority: 0 }];

  resolveKnownFixedConfigs(width, height).forEach((config, index) => {
    entries.push({ config, priority: 1 + index });
  });

  resolveOfficialSearchConfigs(width, height).forEach((config, index) => {
    entries.push({ config, priority: 10 + index });
  });

  const largeMarginVariant = createCurrentLargeMarginVariantConfig(defaultConfig, width, height);
  if (largeMarginVariant) entries.push({ config: largeMarginVariant, priority: 20 });

  const isKnownSize = matchOfficialGeminiImageSize(width, height) !== null;
  if (!isKnownSize) {
    const newMarginVariant = createUnknownSizeNewMarginVariantConfig(defaultConfig, width, height);
    if (newMarginVariant) entries.push({ config: newMarginVariant, priority: 21 });

    const unknownLargeMargin = createCurrentLargeMarginVariantConfig(defaultConfig, width, height, {
      allowAnyBase: true,
    });
    if (unknownLargeMargin) entries.push({ config: unknownLargeMargin, priority: 22 });
  }

  return dedupeRanked(entries.filter((entry) => fitsInBounds(entry.config, width, height)));
}
