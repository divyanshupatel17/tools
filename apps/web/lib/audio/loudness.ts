/**
 * Peak, RMS and an ITU-R BS.1770 style integrated loudness estimate, computed client side from
 * decoded PCM so the Volume Booster's info panel and its clipping math both come from the same
 * real numbers rather than a guess. The K-weighting filter coefficients below are the BS.1770-4
 * reference pair (defined at 48kHz); applying them unadjusted at other sample rates is a small,
 * accepted approximation, and this estimate skips the standard's gating step, so it's labelled
 * "Estimated" wherever it's shown rather than claimed as a certified LUFS reading.
 */

export interface AudioStats {
  peak_db: number;
  /** Linear 0..1 peak amplitude, kept alongside the dB figure for the clipping headroom math. */
  peak_linear: number;
  rms_db: number;
  lufs_integrated: number;
  /** Crude peak-to-RMS crest factor in dB, not a true BS.1770 loudness range. */
  dynamic_range_db: number;
}

const SHELF = { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 };
const HPF = { b0: 1.0, b1: -2.0, b2: 1.0, a1: -1.99004745483398, a2: 0.99007225036621 };

function applyBiquad(
  input: Float32Array,
  coeffs: { b0: number; b1: number; b2: number; a1: number; a2: number },
): Float32Array {
  const output = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i += 1) {
    const x0 = input[i] ?? 0;
    const y0 = coeffs.b0 * x0 + coeffs.b1 * x1 + coeffs.b2 * x2 - coeffs.a1 * y1 - coeffs.a2 * y2;
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}

function toDb(linear: number): number {
  return linear > 0 ? 20 * Math.log10(linear) : -Infinity;
}

/** Computes real stats from an already decoded AudioBuffer (up to 2 channels weighted equally,
 *  the common case for the containers this tool set accepts). */
export function computeAudioStats(buffer: AudioBuffer): AudioStats {
  const channels = Math.max(1, buffer.numberOfChannels);
  let peak = 0;
  let sumSquares = 0;
  let sampleCount = 0;
  let weightedMeanSquareSum = 0;

  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      const value = Math.abs(data[i] ?? 0);
      if (value > peak) peak = value;
      sumSquares += (data[i] ?? 0) * (data[i] ?? 0);
    }
    sampleCount += data.length;

    const shelved = applyBiquad(data, SHELF);
    const weighted = applyBiquad(shelved, HPF);
    let channelSquareSum = 0;
    for (let i = 0; i < weighted.length; i += 1) {
      const value = weighted[i] ?? 0;
      channelSquareSum += value * value;
    }
    weightedMeanSquareSum += weighted.length > 0 ? channelSquareSum / weighted.length : 0;
  }

  const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
  const peakDb = toDb(peak);
  const rmsDb = toDb(rms);
  const lufs = weightedMeanSquareSum > 0 ? -0.691 + 10 * Math.log10(weightedMeanSquareSum) : -Infinity;
  const dynamicRange = Number.isFinite(peakDb) && Number.isFinite(rmsDb) ? peakDb - rmsDb : 0;

  return {
    peak_db: peakDb,
    peak_linear: peak,
    rms_db: rmsDb,
    lufs_integrated: lufs,
    dynamic_range_db: Math.max(0, dynamicRange),
  };
}

/** Decodes a file with the Web Audio API purely to compute loudness stats; returns null if the
 *  browser can't decode it into PCM (the file may still be playable, just without these stats). */
export async function analyzeAudioFile(file: File): Promise<AudioStats | null> {
  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextClass();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await context.decodeAudioData(arrayBuffer);
    return computeAudioStats(buffer);
  } catch {
    return null;
  } finally {
    context.close().catch(() => {
      // Nothing more to clean up if the context refuses to close.
    });
  }
}

/** `-12.3 dB`, `-inf dB` for true silence. */
export function formatDb(value: number): string {
  if (!Number.isFinite(value)) return '−∞ dB';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;
}

/** `-14.0 LUFS`, `-inf LUFS` for true silence. */
export function formatLufs(value: number): string {
  if (!Number.isFinite(value)) return '−∞ LUFS';
  return `${value.toFixed(1)} LUFS`;
}
