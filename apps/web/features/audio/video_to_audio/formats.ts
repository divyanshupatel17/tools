export const EXTRACT_FORMATS = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aiff'] as const;

export type ExtractFormat = (typeof EXTRACT_FORMATS)[number];

export const FORMAT_LABEL: Record<ExtractFormat, string> = {
  mp3: 'MP3',
  wav: 'WAV',
  m4a: 'M4A / AAC',
  ogg: 'OGG',
  flac: 'FLAC',
  aiff: 'AIFF',
};

export const FORMAT_MIME: Record<ExtractFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aiff: 'audio/aiff',
};

export const FORMAT_CODEC: Record<ExtractFormat, string[]> = {
  mp3: ['-c:a', 'libmp3lame'],
  wav: ['-c:a', 'pcm_s16le'],
  m4a: ['-c:a', 'aac'],
  ogg: ['-c:a', 'libvorbis'],
  flac: ['-c:a', 'flac'],
  aiff: ['-c:a', 'pcm_s16be'],
};

/** WAV, FLAC and AIFF are all lossless PCM containers; a bitrate target has no meaning for any
 *  of them, so the quality control is hidden and no `-b:a` is passed. */
export const LOSSLESS_FORMATS: readonly ExtractFormat[] = ['wav', 'flac', 'aiff'];

export function isLossless(format: ExtractFormat): boolean {
  return LOSSLESS_FORMATS.includes(format);
}

export const QUALITY_PRESETS = ['low', 'normal', 'high', 'very_high', 'best'] as const;
export type QualityPreset = (typeof QUALITY_PRESETS)[number];

export const QUALITY_LABEL: Record<QualityPreset, string> = {
  low: 'Low (64 kbps)',
  normal: 'Normal (128 kbps)',
  high: 'High (192 kbps)',
  very_high: 'Very High (256 kbps)',
  best: 'Best (320 kbps)',
};

export const QUALITY_BITRATE_KBPS: Record<QualityPreset, number> = {
  low: 64,
  normal: 128,
  high: 192,
  very_high: 256,
  best: 320,
};

export const SAMPLE_RATE_OPTIONS = ['source', 44100, 48000, 96000] as const;
export type SampleRateOption = (typeof SAMPLE_RATE_OPTIONS)[number];

export const CHANNELS_OPTIONS = ['source', 'mono', 'stereo'] as const;
export type ChannelsOption = (typeof CHANNELS_OPTIONS)[number];
