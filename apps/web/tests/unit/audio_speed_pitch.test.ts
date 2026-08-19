import { describe, expect, it } from 'vitest';
import { codecForExtension } from '@/features/audio/audio_speed_pitch/formats';
import {
  atempoChain,
  buildSpeedPitchArgs,
  resolvePitchFactor,
  resolveSpeedFactor,
  type AudioSpeedPitchOptions,
} from '@/features/audio/audio_speed_pitch/processor';

const baseOptions: AudioSpeedPitchOptions = {
  speed_percent: 100,
  pitch_semitones: 0,
  preserve_pitch: true,
  source_sample_rate: 44100,
  bitrate_kbps: 160,
};

describe('resolveSpeedFactor', () => {
  it('is unity at 100%', () => {
    expect(resolveSpeedFactor(100)).toBe(1);
  });

  it('clamps to the 10..1000 percent range', () => {
    expect(resolveSpeedFactor(1)).toBe(0.1);
    expect(resolveSpeedFactor(5000)).toBe(10);
  });
});

describe('resolvePitchFactor', () => {
  it('is unity at 0 semitones', () => {
    expect(resolvePitchFactor(0)).toBe(1);
  });

  it('doubles at +12 semitones and halves at -12', () => {
    expect(resolvePitchFactor(12)).toBeCloseTo(2, 5);
    expect(resolvePitchFactor(-12)).toBeCloseTo(0.5, 5);
  });
});

describe('atempoChain', () => {
  it('needs no stage for unity', () => {
    expect(atempoChain(1)).toEqual([]);
  });

  it('splits a factor above 2 into stages each within 0.5..2', () => {
    const stages = atempoChain(4);
    expect(stages.every((stage) => stage >= 0.5 && stage <= 2)).toBe(true);
    expect(stages.reduce((product, stage) => product * stage, 1)).toBeCloseTo(4, 5);
  });

  it('splits a factor below 0.5 into stages each within 0.5..2', () => {
    const stages = atempoChain(0.1);
    expect(stages.every((stage) => stage >= 0.5 && stage <= 2)).toBe(true);
    expect(stages.reduce((product, stage) => product * stage, 1)).toBeCloseTo(0.1, 5);
  });

  it('keeps a single stage for a factor already within range', () => {
    expect(atempoChain(1.5)).toEqual([1.5]);
  });
});

describe('buildSpeedPitchArgs', () => {
  it('adds no audio filter when speed and pitch are unchanged', () => {
    const args = buildSpeedPitchArgs(baseOptions, 'mp3', 'in.mp3', 'out.mp3');
    expect(args).not.toContain('-af');
    expect(args).toContain('libmp3lame');
  });

  it('chains atempo stages for a preserved pitch speed change', () => {
    const args = buildSpeedPitchArgs({ ...baseOptions, speed_percent: 400 }, 'mp3', 'in.mp3', 'out.mp3');
    const filter = args[args.indexOf('-af') + 1] ?? '';
    expect(filter).toContain('atempo=2.000000,atempo=2.000000');
  });

  it('uses asetrate instead of atempo when pitch preservation is off', () => {
    const args = buildSpeedPitchArgs(
      { ...baseOptions, speed_percent: 200, preserve_pitch: false },
      'mp3',
      'in.mp3',
      'out.mp3',
    );
    const filter = args[args.indexOf('-af') + 1] ?? '';
    expect(filter).toContain('asetrate=88200');
    expect(filter).not.toContain('atempo');
  });

  it('adds an independent pitch shift filter that keeps duration constant', () => {
    const args = buildSpeedPitchArgs({ ...baseOptions, pitch_semitones: 12 }, 'mp3', 'in.mp3', 'out.mp3');
    const filter = args[args.indexOf('-af') + 1] ?? '';
    expect(filter).toContain('asetrate=88200');
    expect(filter).toContain('aresample=44100');
    expect(filter).toContain('atempo=0.500000');
  });

  it('omits -b:a for a lossless codec', () => {
    const args = buildSpeedPitchArgs({ ...baseOptions, speed_percent: 150 }, 'wav', 'in.wav', 'out.wav');
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
