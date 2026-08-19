import { describe, expect, it } from 'vitest';
import { codecForExtension } from '@/features/audio/trim_audio/formats';
import {
  buildTrimArgs,
  totalKeptDuration,
  trimOutputFileName,
  type TrimAudioOptions,
} from '@/features/audio/trim_audio/processor';

const baseOptions: TrimAudioOptions = {
  segments: [{ start: 0, end: 10 }],
  fade_in: false,
  fade_out: false,
  fade_duration: 2,
  bitrate_kbps: 192,
};

describe('codecForExtension', () => {
  it('maps a known extension to its codec', () => {
    expect(codecForExtension('mp3').codec).toContain('libmp3lame');
    expect(codecForExtension('wav').lossless).toBe(true);
    expect(codecForExtension('flac').lossless).toBe(true);
  });

  it('falls back to mp3 for an unrecognised extension', () => {
    expect(codecForExtension('xyz').extension).toBe('mp3');
  });
});

describe('totalKeptDuration', () => {
  it('sums the length of every segment', () => {
    expect(totalKeptDuration([{ start: 0, end: 5 }, { start: 8, end: 10 }])).toBeCloseTo(7);
  });
});

describe('buildTrimArgs', () => {
  it('builds a single atrim filter for one segment, no concat', () => {
    const args = buildTrimArgs(baseOptions, 'in.mp3', 'out.mp3', 'mp3');
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain('atrim=start=0:end=10');
    expect(filter).not.toContain('concat');
    expect(args).toContain('-b:a');
  });

  it('concatenates multiple kept segments in order', () => {
    const options: TrimAudioOptions = {
      ...baseOptions,
      segments: [
        { start: 0, end: 5 },
        { start: 8, end: 12 },
      ],
    };
    const args = buildTrimArgs(options, 'in.mp3', 'out.mp3', 'mp3');
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain('atrim=start=0:end=5');
    expect(filter).toContain('atrim=start=8:end=12');
    expect(filter).toContain('concat=n=2:v=0:a=1');
  });

  it('adds fade in and fade out filters when requested', () => {
    const options: TrimAudioOptions = { ...baseOptions, fade_in: true, fade_out: true, fade_duration: 2 };
    const args = buildTrimArgs(options, 'in.mp3', 'out.mp3', 'mp3');
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain('afade=t=in:st=0:d=2');
    expect(filter).toContain('afade=t=out:st=8:d=2');
  });

  it('skips -b:a for a lossless codec', () => {
    const args = buildTrimArgs(baseOptions, 'in.wav', 'out.wav', 'wav');
    expect(args).toContain('pcm_s16le');
    expect(args).not.toContain('-b:a');
  });

  it('throws when every segment has been cut', () => {
    const options: TrimAudioOptions = { ...baseOptions, segments: [] };
    expect(() => buildTrimArgs(options, 'in.mp3', 'out.mp3', 'mp3')).toThrow();
  });
});

describe('trimOutputFileName', () => {
  it('swaps the extension to match the resolved codec', () => {
    expect(trimOutputFileName('clip.wav', 'mp3')).toBe('clip.mp3');
  });
});
