/**
 * The raw `MediaRecorder` capture is WebM/Opus in most browsers (M4A/AAC in Safari) with no
 * fixed duration in its own header, since the browser doesn't know the final length upfront.
 * This project's ffmpeg WASM core has documented, reproducible trouble with `libopus` (see
 * docs/audio_tools.md), so rather than hand that container straight to ffmpeg, the capture is
 * decoded once with the browser's own, reliable decoder (the same one that already powers
 * playback) and re-wrapped as a plain PCM WAV file. ffmpeg only ever sees that WAV, never the
 * original opus stream.
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

/** Decodes `blob` and re-wraps it as a WAV `File`. Returns null when the browser can't decode it
 *  into PCM, so the caller can fall back to sending the original capture to ffmpeg instead. */
export async function convertToWavFile(blob: Blob, fileName: string): Promise<File | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    const context = new AudioContextClass();
    try {
      const buffer = await context.decodeAudioData(arrayBuffer);
      const channels: Float32Array[] = [];
      for (let c = 0; c < buffer.numberOfChannels; c += 1) channels.push(buffer.getChannelData(c));
      const wavBlob = encodeWavFromChannels(channels, buffer.sampleRate);
      return new File([wavBlob], fileName, { type: 'audio/wav' });
    } finally {
      context.close().catch(() => {
        // Nothing more to clean up if the context refuses to close.
      });
    }
  } catch {
    return null;
  }
}
