export type RecordSource = 'screen' | 'camera' | 'screen_camera';
export type BubbleCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type BubbleShape = 'circle' | 'rounded' | 'square';

export interface BubbleSettings {
  /** Normalised 0..1, the bubble's own top left corner as a fraction of the recording frame —
   *  set by dragging it on the live preview, not a fixed enum of positions. */
  x: number;
  y: number;
  /** 0..1, the bubble's diameter as a fraction of the frame's shorter side, adjusted with a
   *  slider rather than a small/medium/large enum so it can land on any size in between. */
  sizeRatio: number;
  shape: BubbleShape;
  border: boolean;
  shadow: boolean;
}

export const MIN_BUBBLE_SIZE_RATIO = 0.1;
export const MAX_BUBBLE_SIZE_RATIO = 0.45;

export const DEFAULT_BUBBLE: BubbleSettings = {
  x: 0.7,
  y: 0.66,
  sizeRatio: 0.18,
  shape: 'circle',
  border: true,
  shadow: true,
};

const CORNER_MARGIN = 0.03;

/** Where dragging a bubble of `sizeRatio` fully into one corner would land it — used by the
 *  corner quick buttons; free dragging on the preview overrides this at any time afterwards. */
export function cornerPosition(corner: BubbleCorner, sizeRatio: number): { x: number; y: number } {
  const x = corner.includes('right') ? 1 - sizeRatio - CORNER_MARGIN : CORNER_MARGIN;
  const y = corner.includes('bottom') ? 1 - sizeRatio - CORNER_MARGIN : CORNER_MARGIN;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

export interface QualityPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
}

export const QUALITY_PRESETS: readonly QualityPreset[] = [
  { id: '720p30', label: '720p · 30 fps', width: 1280, height: 720, fps: 30 },
  { id: '1080p30', label: '1080p · 30 fps', width: 1920, height: 1080, fps: 30 },
  { id: '1080p60', label: '1080p · 60 fps', width: 1920, height: 1080, fps: 60 },
  { id: '1440p30', label: '1440p · 30 fps', width: 2560, height: 1440, fps: 30 },
];
export const DEFAULT_QUALITY_ID = '1080p30';

export function qualityById(id: string): QualityPreset {
  return QUALITY_PRESETS.find((preset) => preset.id === id) ?? QUALITY_PRESETS[1]!;
}

export interface RecordingPreset {
  id: string;
  label: string;
  description: string;
  source: RecordSource;
  quality_id: string;
  mic: boolean;
  bubble: BubbleSettings | null;
}

/**
 * One click bundles of source + quality + camera bubble for the recording shapes people actually
 * want, so a visitor doesn't have to reassemble the same four or five settings by hand every
 * time. Picking a preset just seeds the individual controls below it; every field stays editable
 * afterwards, this is a starting point, not a locked mode.
 */
export const RECORDING_PRESETS: readonly RecordingPreset[] = [
  {
    id: 'presentation',
    label: 'Presentation',
    description: 'Screen with a small webcam bubble and narration, 1080p 30fps.',
    source: 'screen_camera',
    quality_id: '1080p30',
    mic: true,
    bubble: DEFAULT_BUBBLE,
  },
  {
    id: 'tutorial',
    label: 'Tutorial',
    description: 'Screen only with narration, 1080p 30fps.',
    source: 'screen',
    quality_id: '1080p30',
    mic: true,
    bubble: null,
  },
  {
    id: 'webcam',
    label: 'Webcam only',
    description: 'Camera and microphone only, 1080p 30fps.',
    source: 'camera',
    quality_id: '1080p30',
    mic: true,
    bubble: null,
  },
  {
    id: 'fast_motion',
    label: 'Fast motion',
    description: 'Screen only at 60fps, for gameplay or fast moving UI.',
    source: 'screen',
    quality_id: '1080p60',
    mic: false,
    bubble: null,
  },
  {
    id: 'quick_clip',
    label: 'Quick clip',
    description: 'Screen only, 720p 30fps, the smallest file for a fast share.',
    source: 'screen',
    quality_id: '720p30',
    mic: false,
    bubble: null,
  },
];

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the camera bubble sits in canvas pixels for a given canvas size and bubble settings.
 *  `bubble.x`/`bubble.y` are the bubble's own top left corner, clamped so it can never drag
 *  partly off the edge of the frame regardless of what a free drag or a resize just set them to. */
export function bubbleRect(canvasWidth: number, canvasHeight: number, bubble: BubbleSettings): Rect {
  const diameter = Math.round(Math.min(canvasWidth, canvasHeight) * bubble.sizeRatio);
  const left = Math.round(Math.min(Math.max(0, bubble.x) * canvasWidth, canvasWidth - diameter));
  const top = Math.round(Math.min(Math.max(0, bubble.y) * canvasHeight, canvasHeight - diameter));
  return { left, top, width: diameter, height: diameter };
}

/** The largest centered rect of `sourceRatio` that fully covers `rect` — the same math
 *  `object-fit: cover` uses, needed here because canvas `drawImage` has no such mode of its own. */
export function coverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  rect: Pick<Rect, 'width' | 'height'>,
): { sx: number; sy: number; sw: number; sh: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0 || rect.width <= 0 || rect.height <= 0) {
    return { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight };
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = rect.width / rect.height;
  if (sourceRatio > targetRatio) {
    const sw = sourceHeight * targetRatio;
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight };
  }
  const sh = sourceWidth / targetRatio;
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh };
}

/** Picks the first MediaRecorder mimeType this browser actually supports; null when the browser
 *  exposes no working candidate at all (MediaRecorder itself, not just this list). */
export function pickSupportedMimeType(
  candidates: readonly string[],
  isSupported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
): string | null {
  return candidates.find((type) => isSupported(type)) ?? null;
}

/** Preferred to least preferred: VP9 gives the smallest file at equal quality, VP8 is the widest
 *  supported fallback, and a bare 'video/webm' lets the browser choose its own default codec. */
export const RECORDER_MIME_CANDIDATES: readonly string[] = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
