export const QUALITY_PRESETS = [
  { id: 'low', label: 'Low', kbps: 64 },
  { id: 'standard', label: 'Standard', kbps: 128 },
  { id: 'high', label: 'High', kbps: 192 },
  { id: 'very_high', label: 'Very High', kbps: 256 },
] as const;

export type QualityPresetId = (typeof QUALITY_PRESETS)[number]['id'];

export const MIN_CUSTOM_KBPS = 32;
export const MAX_CUSTOM_KBPS = 320;

/** Sample rates offered for the exported file; the ffmpeg `-ar` flag enforces whichever one is
 *  chosen regardless of what the microphone itself was captured at. */
export const SAMPLE_RATE_OPTIONS = [22050, 32000, 44100, 48000, 96000] as const;

/** MIME types tried in preference order for the live `MediaRecorder` capture. The exported file
 *  is always MP3 either way (see `processor.ts`); this only affects the intermediate recording,
 *  so any one of these being unsupported just falls through to the next. */
const CAPTURE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
};

export function pickCaptureMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const candidate of CAPTURE_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

/** The container extension for a capture MIME type, used to name the file handed to ffmpeg. */
export function extensionForMimeType(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim() ?? '';
  return EXTENSION_BY_MIME[base] ?? 'webm';
}
