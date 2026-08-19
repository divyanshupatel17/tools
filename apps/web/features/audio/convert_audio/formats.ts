// Opus and WebM (both `libopus`) are deliberately left out: the encode reliably hits a fatal
// trap in this single threaded FFmpeg WASM core, on every attempt, for any input — not a rare
// field failure like the video tool's Opus note, an unconditional one here. See
// docs/audio_tools.md for the reasoning.
export const CONVERT_AUDIO_FORMATS = ['mp3', 'wav', 'm4a', 'ogg', 'flac'] as const;

export type ConvertAudioFormat = (typeof CONVERT_AUDIO_FORMATS)[number];

export const FORMAT_LABEL: Record<ConvertAudioFormat, string> = {
  mp3: 'MP3',
  wav: 'WAV',
  m4a: 'M4A / AAC',
  ogg: 'OGG / Vorbis',
  flac: 'FLAC',
};

export const FORMAT_MIME: Record<ConvertAudioFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};

/** WAV and FLAC store samples losslessly; a bitrate target has no meaning for either, so the
 *  quality control is hidden and no `-b:a` is ever passed for them. */
export const LOSSLESS_FORMATS: readonly ConvertAudioFormat[] = ['wav', 'flac'];

export function isLossless(format: ConvertAudioFormat): boolean {
  return LOSSLESS_FORMATS.includes(format);
}

export const QUALITY_PRESETS = ['low', 'normal', 'high', 'very_high', 'best'] as const;
export type QualityPreset = (typeof QUALITY_PRESETS)[number];

export const QUALITY_LABEL: Record<QualityPreset, string> = {
  low: 'Low (96 kbps)',
  normal: 'Normal (128 kbps)',
  high: 'High (192 kbps)',
  very_high: 'Very High (256 kbps)',
  best: 'Best (320 kbps)',
};

export const QUALITY_BITRATE_KBPS: Record<QualityPreset, number> = {
  low: 96,
  normal: 128,
  high: 192,
  very_high: 256,
  best: 320,
};

export const SAMPLE_RATE_OPTIONS = ['source', 44100, 48000, 96000, 192000] as const;
export type SampleRateOption = (typeof SAMPLE_RATE_OPTIONS)[number];

export const SAMPLE_RATE_LABEL: Record<SampleRateOption, string> = {
  source: 'Same as source',
  44100: '44100 Hz',
  48000: '48000 Hz',
  96000: '96000 Hz',
  192000: '192000 Hz',
};

export const CHANNELS_OPTIONS = ['source', 'mono', 'stereo'] as const;
export type ChannelsOption = (typeof CHANNELS_OPTIONS)[number];

export const CHANNELS_LABEL: Record<ChannelsOption, string> = {
  source: 'Same as source',
  mono: 'Mono',
  stereo: 'Stereo',
};
