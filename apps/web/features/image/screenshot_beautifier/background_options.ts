export type BackgroundType = 'solid' | 'gradient';

export interface GradientDirection {
  id: string;
  label: string;
  /** Direction of travel across the canvas, from 0,0 toward dx,dy. */
  dx: number;
  dy: number;
}

export const GRADIENT_DIRECTIONS: readonly GradientDirection[] = [
  { id: 'sideways', label: 'Sideways', dx: 1, dy: 0 },
  { id: 'downward', label: 'Downward', dx: 0, dy: 1 },
  { id: 'diagonal', label: 'Diagonal', dx: 1, dy: 1 },
];

export const DEFAULT_DIRECTION_ID = 'diagonal';

export interface BackgroundPreset {
  id: string;
  label: string;
  type: BackgroundType;
  color: string;
  color2?: string;
  direction?: string;
}

/** A handful of tasteful starting points; every field stays editable after picking one. */
export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  { id: 'cloud', label: 'Cloud', type: 'solid', color: '#eef1f5' },
  { id: 'slate', label: 'Slate', type: 'solid', color: '#2b2f36' },
  {
    id: 'sunset',
    label: 'Sunset',
    type: 'gradient',
    color: '#ff9a6c',
    color2: '#ff5da2',
    direction: 'diagonal',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    type: 'gradient',
    color: '#3a8dff',
    color2: '#37e2c4',
    direction: 'sideways',
  },
  {
    id: 'mint',
    label: 'Mint',
    type: 'gradient',
    color: '#3fd39b',
    color2: '#8ce88a',
    direction: 'downward',
  },
  {
    id: 'grape',
    label: 'Grape',
    type: 'gradient',
    color: '#7b5cff',
    color2: '#d76bff',
    direction: 'diagonal',
  },
];

export interface AspectOption {
  id: string;
  label: string;
  /** Width divided by height. Null follows the screenshot's own natural shape. */
  ratio: number | null;
}

export const ASPECT_OPTIONS: readonly AspectOption[] = [
  { id: 'original', label: 'Matches the screenshot', ratio: null },
  { id: 'square', label: 'Square', ratio: 1 },
  { id: '4:3', label: '4 to 3', ratio: 4 / 3 },
  { id: '16:9', label: 'Widescreen', ratio: 16 / 9 },
  { id: '9:16', label: 'Story', ratio: 9 / 16 },
];

export const DEFAULT_ASPECT_ID = 'square';

/** Long edge of the exported composition in pixels. Shared so the panel can state the real size. */
export const EXPORT_LONG_EDGE = 2000;

export function findAspect(id: string | undefined): AspectOption {
  return (
    ASPECT_OPTIONS.find((item) => item.id === id) ??
    ASPECT_OPTIONS.find((item) => item.id === DEFAULT_ASPECT_ID)!
  );
}

/** Resolves the finished canvas size for an aspect choice, falling back to the bitmap's own shape. */
export function computeCanvasSize(
  aspectId: string | undefined,
  naturalSize: { width: number; height: number },
  longEdge: number,
): { width: number; height: number } {
  const aspect = findAspect(aspectId);
  const ratio = aspect.ratio ?? naturalSize.width / naturalSize.height;

  if (ratio >= 1) {
    return { width: Math.round(longEdge), height: Math.max(1, Math.round(longEdge / ratio)) };
  }
  return { width: Math.max(1, Math.round(longEdge * ratio)), height: Math.round(longEdge) };
}
