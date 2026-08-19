import type { FileRule } from '@tools/file_utils';

/** Containers every audio tool accepts as input. */
export const AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'oga',
  'opus',
  'flac',
  'webm',
  'wma',
  'aiff',
  'aif',
] as const;

export const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/opus',
  'audio/flac',
  'audio/webm',
  'audio/x-ms-wma',
  'audio/aiff',
  'audio/x-aiff',
] as const;

/** `accept` string for a file input covering every container this tool set reads. */
export const AUDIO_ACCEPT = [
  ...AUDIO_MIME_TYPES,
  ...AUDIO_EXTENSIONS.map((extension) => `.${extension}`),
].join(',');

/** Builds a FileRule for @tools/file_utils covering every container an audio tool reads. */
export function audioRule(options?: { max_files?: number; max_bytes?: number }): FileRule {
  return {
    extensions: [...AUDIO_EXTENSIONS],
    max_files: options?.max_files ?? 1,
    max_bytes: options?.max_bytes ?? 200 * 1024 * 1024,
  };
}

export interface AudioMeta {
  duration: number;
  sample_rate: number | null;
  channels: number | null;
  /** Peak amplitude (0..1) per bucket across the whole file, for drawing a waveform. Empty when
   *  the browser could not decode this file into PCM (still playable, just no waveform). */
  peaks: Float32Array;
}

/**
 * Decodes a file with the Web Audio API to read duration, sample rate, channel count and a
 * waveform in one pass, entirely in the browser. Falls back to reading duration only, through a
 * plain `<audio>` element, when the format decodes for playback but not into raw PCM (rare, but
 * some browsers are pickier about `decodeAudioData` than about `<audio>` itself).
 */
export async function readAudioMeta(file: File, buckets = 1200): Promise<AudioMeta> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
    const channelData = buffer.getChannelData(0);
    return {
      duration: buffer.duration,
      sample_rate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      peaks: computeWaveformPeaks(channelData, buckets),
    };
  } catch {
    const duration = await readDurationFallback(file);
    return { duration, sample_rate: null, channels: null, peaks: new Float32Array(0) };
  } finally {
    context.close().catch(() => {
      // Nothing more to clean up if the context refuses to close.
    });
  }
}

function readDurationFallback(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as audio.'));
    };
    audio.src = url;
  });
}

/** Reduces raw PCM samples to one peak amplitude per bucket, evenly spanning the whole track. */
export function computeWaveformPeaks(channelData: Float32Array, buckets: number): Float32Array {
  const peaks = new Float32Array(buckets);
  if (channelData.length === 0 || buckets <= 0) return peaks;
  const samplesPerBucket = channelData.length / buckets;
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = Math.floor(bucket * samplesPerBucket);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * samplesPerBucket));
    let peak = 0;
    for (let i = start; i < end && i < channelData.length; i += 1) {
      const value = Math.abs(channelData[i] ?? 0);
      if (value > peak) peak = value;
    }
    peaks[bucket] = Math.min(1, peak);
  }
  return peaks;
}

/** `mm:ss.d`, matching the tenths-of-a-second precision the waveform scrubber shows. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.0';
  const total = Math.round(seconds * 10) / 10;
  const minutes = Math.floor(total / 60);
  const rest = total - minutes * 60;
  const wholeSeconds = Math.floor(rest);
  const tenths = Math.round((rest - wholeSeconds) * 10) % 10;
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${tenths}`;
}

/** Parses `formatTime`'s own `mm:ss.d` back to seconds, tolerating `m:ss`, `ss` and `ss.d` too.
 *  Returns null for anything that isn't a plausible time, so a caller can fall back to the last
 *  known good value instead of jumping to 0. */
export function parseTime(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (!match) return null;
  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return minutes * 60 + seconds;
}
