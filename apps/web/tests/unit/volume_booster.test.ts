import { describe, expect, it } from 'vitest';
import { codecForExtension } from '@/features/audio/volume_booster/formats';
import {
  buildVolumeArgs,
  resolveGainFactor,
  type VolumeBoosterOptions,
} from '@/features/audio/volume_booster/processor';
import { computeAudioStats } from '@/lib/audio/loudness';

const baseOptions: VolumeBoosterOptions = {
  volume_percent: 100,
  gain_db: 0,
  normalize: false,
  target_lufs: -14,
  bitrate_kbps: 160,
};

describe('resolveGainFactor', () => {
  it('is unity at 100% and 0 dB', () => {
    expect(resolveGainFactor(baseOptions)).toBeCloseTo(1, 5);
  });

  it('doubles at +6.02 dB', () => {
    expect(resolveGainFactor({ ...baseOptions, gain_db: 6.0206 })).toBeCloseTo(2, 2);
  });

  it('stacks the percent and dB multipliers', () => {
    const factor = resolveGainFactor({ ...baseOptions, volume_percent: 200, gain_db: 6.0206 });
    expect(factor).toBeCloseTo(4, 2);
  });

  it('is zero at 0% volume regardless of gain', () => {
    expect(resolveGainFactor({ ...baseOptions, volume_percent: 0, gain_db: 10 })).toBe(0);
  });
});

describe('buildVolumeArgs', () => {
  it('applies a volume filter with the resolved factor when not normalizing', () => {
    const args = buildVolumeArgs({ ...baseOptions, volume_percent: 150 }, 'mp3', 'in.mp3', 'out.mp3');
    expect(args).toContain('-af');
    expect(args[args.indexOf('-af') + 1]).toBe('volume=1.5');
    expect(args).toContain('libmp3lame');
    expect(args).toContain('-b:a');
  });

  it('uses loudnorm to the target LUFS when normalizing, ignoring volume/gain', () => {
    const args = buildVolumeArgs(
      { ...baseOptions, normalize: true, target_lufs: -16, volume_percent: 300, gain_db: 15 },
      'mp3',
      'in.mp3',
      'out.mp3',
    );
    expect(args[args.indexOf('-af') + 1]).toBe('loudnorm=I=-16:TP=-1.5:LRA=11');
  });

  it('omits -b:a for a lossless codec', () => {
    const args = buildVolumeArgs(baseOptions, 'wav', 'in.wav', 'out.wav');
    expect(args).not.toContain('-b:a');
    expect(args).toContain('pcm_s16le');
  });
});

describe('codecForExtension', () => {
  it('keeps recognised containers in their own format', () => {
    expect(codecForExtension('flac').extension).toBe('flac');
    expect(codecForExtension('m4a').extension).toBe('m4a');
  });

  it('falls back to mp3 for anything unrecognised', () => {
    expect(codecForExtension('wma').extension).toBe('mp3');
  });
});

describe('computeAudioStats', () => {
  function makeBuffer(samples: Float32Array, sampleRate = 48000): AudioBuffer {
    return {
      numberOfChannels: 1,
      sampleRate,
      length: samples.length,
      duration: samples.length / sampleRate,
      getChannelData: () => samples,
    } as unknown as AudioBuffer;
  }

  it('reports silence as -Infinity dB and zero dynamic range', () => {
    const stats = computeAudioStats(makeBuffer(new Float32Array(4800)));
    expect(stats.peak_db).toBe(-Infinity);
    expect(stats.rms_db).toBe(-Infinity);
    expect(stats.dynamic_range_db).toBe(0);
    expect(stats.peak_linear).toBe(0);
  });

  it('reports a full scale constant signal at 0 dBFS peak', () => {
    const samples = new Float32Array(4800).fill(1);
    const stats = computeAudioStats(makeBuffer(samples));
    expect(stats.peak_db).toBeCloseTo(0, 5);
    expect(stats.peak_linear).toBeCloseTo(1, 5);
  });

  it('gives a quieter signal a lower peak and RMS than a louder one', () => {
    const loud = computeAudioStats(makeBuffer(new Float32Array(4800).fill(0.9)));
    const quiet = computeAudioStats(makeBuffer(new Float32Array(4800).fill(0.1)));
    expect(loud.peak_db).toBeGreaterThan(quiet.peak_db);
    expect(loud.rms_db).toBeGreaterThan(quiet.rms_db);
  });
});
