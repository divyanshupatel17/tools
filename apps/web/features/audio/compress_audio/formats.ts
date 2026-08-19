/** Compressing only makes sense against the lossy encoders already proven reliable in this
 *  FFmpeg WASM core (see docs/audio_tools.md — libopus is excluded everywhere). The source's own
 *  container decides which of the three this tool writes back out as. */
export type CompressAudioFormat = 'mp3' | 'm4a' | 'ogg';

export const FORMAT_LABEL: Record<CompressAudioFormat, string> = {
  mp3: 'MP3',
  m4a: 'M4A / AAC',
  ogg: 'OGG / Vorbis',
};

export const FORMAT_MIME: Record<CompressAudioFormat, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
};

export const FORMAT_CODEC: Record<CompressAudioFormat, string[]> = {
  mp3: ['-c:a', 'libmp3lame'],
  m4a: ['-c:a', 'aac'],
  ogg: ['-c:a', 'libvorbis'],
};

/**
 * Keeps M4A/AAC and OGG/Vorbis sources in their own format since both compress cleanly at a
 * lower bitrate; every other source (WAV, FLAC and anything else, lossless or not) has no lossy
 * encoder of its own here, so it compresses down to MP3, the most broadly compatible target.
 */
export function detectCompressFormat(extension: string): CompressAudioFormat {
  const ext = extension.toLowerCase();
  if (ext === 'm4a' || ext === 'aac') return 'm4a';
  if (ext === 'ogg' || ext === 'oga') return 'ogg';
  return 'mp3';
}

export const SAMPLE_RATE_OPTIONS = ['source', 48000, 32000, 22050] as const;
export type SampleRateOption = (typeof SAMPLE_RATE_OPTIONS)[number];

export const CHANNELS_OPTIONS = ['source', 'mono', 'stereo'] as const;
export type ChannelsOption = (typeof CHANNELS_OPTIONS)[number];
