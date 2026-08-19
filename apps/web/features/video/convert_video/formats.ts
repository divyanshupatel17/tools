/** Every output this tool can write. Video containers first, then audio only extraction. */
export const VIDEO_OUTPUT_FORMATS = [
  'mp4',
  'webm',
  'mov',
  'avi',
  'mkv',
  'flv',
  'wmv',
  'mpeg',
  'ogv',
  '3gp',
  'ts',
  'gif',
] as const;

// AMR and OPUS are left out: AMR needs libopencore_amrnb, which is not compiled into the self
// hosted FFmpeg WASM core; OPUS encoding proved unreliable in the field even though it tested
// clean here, so it was pulled rather than kept as an option that sometimes fails. See
// docs/video_tools.md for the full reasoning.
export const AUDIO_OUTPUT_FORMATS = [
  'mp3',
  'wav',
  'aac',
  'm4a',
  'flac',
  'ogg',
  'aiff',
  'wma',
  'ac3',
  'm4r',
] as const;

export const CONVERT_VIDEO_FORMATS = [...VIDEO_OUTPUT_FORMATS, ...AUDIO_OUTPUT_FORMATS] as const;

export type ConvertVideoFormat = (typeof CONVERT_VIDEO_FORMATS)[number];

export const FORMAT_LABEL: Record<ConvertVideoFormat, string> = {
  mp4: 'MP4',
  webm: 'WebM',
  mov: 'MOV',
  avi: 'AVI',
  mkv: 'MKV',
  flv: 'FLV',
  wmv: 'WMV',
  mpeg: 'MPEG',
  ogv: 'OGV',
  '3gp': '3GP',
  ts: 'TS',
  gif: 'GIF',
  mp3: 'MP3',
  wav: 'WAV',
  aac: 'AAC',
  m4a: 'M4A',
  flac: 'FLAC',
  ogg: 'OGG',
  aiff: 'AIFF',
  wma: 'WMA',
  ac3: 'AC3',
  m4r: 'M4R',
};

export const FORMAT_MIME: Record<ConvertVideoFormat, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  flv: 'video/x-flv',
  wmv: 'video/x-ms-wmv',
  mpeg: 'video/mpeg',
  ogv: 'video/ogg',
  '3gp': 'video/3gpp',
  ts: 'video/mp2t',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  aiff: 'audio/aiff',
  wma: 'audio/x-ms-wma',
  ac3: 'audio/ac3',
  // Genuinely 'audio/x-m4r' (Apple's ringtone extension), but that MIME is not one any browser
  // media engine recognises; on a blob: URL (no HTTP Content-Type to fall back on) that makes
  // playback fail even though the bytes are ordinary AAC-in-MP4. 'audio/mp4' is accurate (an
  // M4R is exactly an MP4 container) and is a type every browser already knows how to play.
  m4r: 'audio/mp4',
};

export function isAudioFormat(format: ConvertVideoFormat): boolean {
  return (AUDIO_OUTPUT_FORMATS as readonly string[]).includes(format);
}
