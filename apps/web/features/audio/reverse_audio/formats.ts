interface CodecSpec {
  extension: string;
  codec: string[];
  lossless: boolean;
}

/** Codec chosen from the source file's own extension; this tool re-encodes to the same
 *  container it was given. Anything unrecognised falls back to MP3, the one container every
 *  browser can decode back for the result player. */
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

export const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aiff: 'audio/aiff',
};
