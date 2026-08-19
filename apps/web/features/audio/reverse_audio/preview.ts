/**
 * A quick client side reversal used only to preview the result before export: decode with the
 * Web Audio API, reverse every channel's samples, and wrap them back up as a real PCM WAV file
 * so the existing `WaveformPlayer` can play it exactly like any other audio file. The actual
 * export still goes through ffmpeg's `areverse` filter (`processor.ts`); this is a separate,
 * cheaper path that never touches ffmpeg, so the preview appears without loading the WASM engine.
 */

/** Encodes raw PCM channels as a 16 bit WAV `Blob`. Pure and independent of the Web Audio API so
 *  it can be unit tested with plain arrays. */
export function encodeWavFromChannels(
  channels: readonly Float32Array[],
  sampleRate: number,
): Blob {
  const numChannels = Math.max(1, channels.length);
  const length = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, text: string) {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      const raw = channels[c]?.[i] ?? 0;
      const clamped = Math.max(-1, Math.min(1, raw));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/** Reverses every channel of a decoded buffer, in place order (not mutating the source arrays). */
export function reverseChannels(buffer: AudioBuffer): Float32Array[] {
  const length = buffer.length;
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const source = buffer.getChannelData(c);
    const reversed = new Float32Array(length);
    for (let i = 0; i < length; i += 1) reversed[i] = source[length - 1 - i] ?? 0;
    channels.push(reversed);
  }
  return channels;
}

export interface ReversedPreview {
  url: string;
  peaks: Float32Array;
}

/** Decodes `file`, reverses it, and returns an object URL for a real playable WAV file plus a
 *  waveform for it. Returns null when the browser can't decode the file into PCM; the workspace
 *  falls back to offering export without a reversed preview in that case. */
export async function buildReversedPreview(
  file: File,
  computeWaveformPeaks: (channelData: Float32Array, buckets: number) => Float32Array,
  buckets = 1200,
): Promise<ReversedPreview | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    const context = new AudioContextClass();
    try {
      const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
      const reversed = reverseChannels(buffer);
      const blob = encodeWavFromChannels(reversed, buffer.sampleRate);
      const url = URL.createObjectURL(blob);
      const peaks = computeWaveformPeaks(reversed[0] ?? new Float32Array(0), buckets);
      return { url, peaks };
    } finally {
      context.close().catch(() => {
        // Nothing more to clean up if the context refuses to close.
      });
    }
  } catch {
    return null;
  }
}
