/** Fade durations offered in the control panel, in seconds. */
export const FADE_DURATIONS = [0.5, 1, 2, 3, 5] as const;
export type FadeDuration = (typeof FADE_DURATIONS)[number];

interface CodecSpec {
  extension: string;
  codec: string[];
  lossless: boolean;
}

/** Codec chosen from the source file's own extension; the tool re-encodes to the same
 *  container it was given rather than offering a format picker, since the mockup edits in
 *  place. Anything unrecognised falls back to MP3, the one container every browser can decode
 *  back for the result player. */
const CODEC_BY_EXTENSION: Record<string, CodecSpec> = {
  mp3: { extension: 'mp3', codec: ['-c:a', 'libmp3lame'], lossless: false },
  wav: { extension: 'wav', codec: ['-c:a', 'pcm_s16le'], lossless: true },
  m4a: { extension: 'm4a', codec: ['-c:a', 'aac'], lossless: false },
  aac: { extension: 'm4a', codec: ['-c:a', 'aac'], lossless: false },
  ogg: { extension: 'ogg', codec: ['-c:a', 'libvorbis'], lossless: false },
  oga: { extension: 'ogg', codec: ['-c:a', 'libvorbis'], lossless: false },
  flac: { extension: 'flac', codec: ['-c:a', 'flac'], lossless: true },
  aiff: { extension: 'aiff', codec: ['-c:a', 'pcm_s16be'], lossless: true },
  aif: { extension: 'aiff', codec: ['-c:a', 'pcm_s16be'], lossless: true },
};

const DEFAULT_SPEC: CodecSpec = { extension: 'mp3', codec: ['-c:a', 'libmp3lame'], lossless: false };

export function codecForExtension(extension: string): CodecSpec {
  return CODEC_BY_EXTENSION[extension.toLowerCase()] ?? DEFAULT_SPEC;
}
