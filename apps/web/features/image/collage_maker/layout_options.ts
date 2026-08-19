export interface CollageLayout {
  id: string;
  label: string;
  rows: number;
  cols: number;
}

/** Grid layouts offered in the control panel, from a single frame up to a full nine cell grid. */
export const LAYOUTS: readonly CollageLayout[] = [
  { id: '1x1', label: '1 × 1', rows: 1, cols: 1 },
  { id: '1x2', label: '1 × 2', rows: 1, cols: 2 },
  { id: '2x1', label: '2 × 1', rows: 2, cols: 1 },
  { id: '2x2', label: '2 × 2', rows: 2, cols: 2 },
  { id: '3x1', label: '3 × 1', rows: 3, cols: 1 },
  { id: '1x3', label: '1 × 3', rows: 1, cols: 3 },
  { id: '3x2', label: '3 × 2', rows: 3, cols: 2 },
  { id: '2x3', label: '2 × 3', rows: 2, cols: 3 },
  { id: '3x3', label: '3 × 3', rows: 3, cols: 3 },
];

export const DEFAULT_LAYOUT_ID = '2x2';

/** Long edge of the exported collage in pixels. Shared so the workspace can state the exact
 *  export size in its caption instead of guessing at it. */
export const EXPORT_LONG_EDGE = 2000;

export function findLayout(id: string | undefined): CollageLayout {
  return (
    LAYOUTS.find((item) => item.id === id) ?? LAYOUTS.find((item) => item.id === DEFAULT_LAYOUT_ID)!
  );
}

/**
 * The tightest preset grid that holds `count` pictures with as few empty cells as possible,
 * so a fresh collage starts sized to what was actually uploaded instead of a fixed 2 x 2.
 */
export function autoLayoutFor(count: number): CollageLayout {
  if (count <= 0) return findLayout(DEFAULT_LAYOUT_ID);
  const fitting = LAYOUTS.filter((item) => item.rows * item.cols >= count);
  const from = fitting.length > 0 ? fitting : LAYOUTS;
  return from.reduce((best, item) => {
    const bestCells = best.rows * best.cols;
    const itemCells = item.rows * item.cols;
    if (itemCells !== bestCells) return itemCells < bestCells ? item : best;
    const bestSquareness = Math.abs(best.cols - best.rows);
    const itemSquareness = Math.abs(item.cols - item.rows);
    return itemSquareness < bestSquareness ? item : best;
  });
}

export interface AspectRatioOption {
  id: string;
  label: string;
  /** Width divided by height. Null means the ratio follows the chosen grid's own shape. */
  ratio: number | null;
}

export const ASPECT_RATIOS: readonly AspectRatioOption[] = [
  { id: 'square', label: 'Square', ratio: 1 },
  { id: '4:3', label: '4 to 3', ratio: 4 / 3 },
  { id: '3:2', label: '3 to 2', ratio: 3 / 2 },
  { id: '16:9', label: 'Widescreen', ratio: 16 / 9 },
  { id: '9:16', label: 'Portrait', ratio: 9 / 16 },
  { id: 'natural', label: 'Fits the grid', ratio: null },
];

export const DEFAULT_ASPECT_RATIO_ID = 'square';

export function findAspectRatio(id: string | undefined): AspectRatioOption {
  return (
    ASPECT_RATIOS.find((item) => item.id === id) ??
    ASPECT_RATIOS.find((item) => item.id === DEFAULT_ASPECT_RATIO_ID)!
  );
}

/** Resolves the finished canvas size in pixels for a layout, aspect choice and long edge length. */
export function computeCanvasSize(
  layout: CollageLayout,
  aspectRatioId: string | undefined,
  longEdge: number,
): { width: number; height: number } {
  const preset = findAspectRatio(aspectRatioId);
  const ratio = preset.ratio ?? layout.cols / layout.rows;

  if (ratio >= 1) {
    return { width: Math.round(longEdge), height: Math.max(1, Math.round(longEdge / ratio)) };
  }
  return { width: Math.max(1, Math.round(longEdge * ratio)), height: Math.round(longEdge) };
}
