export type JoinMode = 'gap' | 'crossfade';

interface CodecSpec {
  extension: string;
  codec: string[];
  lossless: boolean;
  mime: string;
}

/** Same shape as every other audio tool's per extension codec table. Merge has no format
 *  picker: when every clip shares one extension the output keeps it, otherwise MP3 is the
 *  one container every browser can decode back for the result player. */
const CODEC_BY_EXTENSION: Record<string, CodecSpec> = {
  mp3: { extension: 'mp3', codec: ['-c:a', 'libmp3lame'], lossless: false, mime: 'audio/mpeg' },
  wav: { extension: 'wav', codec: ['-c:a', 'pcm_s16le'], lossless: true, mime: 'audio/wav' },
  m4a: { extension: 'm4a', codec: ['-c:a', 'aac'], lossless: false, mime: 'audio/mp4' },
  aac: { extension: 'm4a', codec: ['-c:a', 'aac'], lossless: false, mime: 'audio/mp4' },
  ogg: { extension: 'ogg', codec: ['-c:a', 'libvorbis'], lossless: false, mime: 'audio/ogg' },
  oga: { extension: 'ogg', codec: ['-c:a', 'libvorbis'], lossless: false, mime: 'audio/ogg' },
  flac: { extension: 'flac', codec: ['-c:a', 'flac'], lossless: true, mime: 'audio/flac' },
  aiff: { extension: 'aiff', codec: ['-c:a', 'pcm_s16be'], lossless: true, mime: 'audio/aiff' },
  aif: { extension: 'aiff', codec: ['-c:a', 'pcm_s16be'], lossless: true, mime: 'audio/aiff' },
};

const DEFAULT_SPEC: CodecSpec = {
  extension: 'mp3',
  codec: ['-c:a', 'libmp3lame'],
  lossless: false,
  mime: 'audio/mpeg',
};

export function codecForExtension(extension: string): CodecSpec {
  return CODEC_BY_EXTENSION[extension.toLowerCase()] ?? DEFAULT_SPEC;
}

/** The output keeps a shared extension across every clip; a mixed set falls back to MP3. */
export function resolveOutputSpec(extensions: string[]): CodecSpec {
  const first = extensions[0]?.toLowerCase();
  const shared = first !== undefined && extensions.every((ext) => ext.toLowerCase() === first);
  return shared && first ? codecForExtension(first) : DEFAULT_SPEC;
}

export const DEFAULT_BITRATE_KBPS = 192;

export const CLIP_COLORS = ['brand', 'success', 'danger', 'ink'] as const;
export type ClipColor = (typeof CLIP_COLORS)[number];

export function colorForIndex(index: number): ClipColor {
  return CLIP_COLORS[index % CLIP_COLORS.length] ?? 'brand';
}
