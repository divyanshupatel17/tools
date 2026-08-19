import { describe, expect, it } from 'vitest';
import { computeWaveformPeaks, formatTime } from '@/lib/audio/audio_formats';
import { CONVERT_AUDIO_FORMATS, isLossless } from '@/features/audio/convert_audio/formats';
import {
  buildConvertArgs,
  convertOutputFileName,
  type ConvertAudioOptions,
} from '@/features/audio/convert_audio/processor';

const baseOptions: ConvertAudioOptions = {
  format: 'mp3',
  quality: 'best',
  sample_rate: 'source',
  channels: 'source',
  normalize: false,
  remove_metadata: false,
};

describe('buildConvertArgs', () => {
  it('builds a lossy codec and bitrate pair for MP3', () => {
    const args = buildConvertArgs(baseOptions, 'in.wav', 'out.mp3');
    expect(args).toEqual(['-i', 'in.wav', '-c:a', 'libmp3lame', '-b:a', '320k', 'out.mp3']);
  });

  it('skips -b:a for a lossless format', () => {
    const args = buildConvertArgs({ ...baseOptions, format: 'wav' }, 'in.mp3', 'out.wav');
    expect(args).toContain('-c:a');
    expect(args).toContain('pcm_s16le');
    expect(args).not.toContain('-b:a');
  });

  it('adds -ar and -ac only when not left as source', () => {
    const args = buildConvertArgs(
      { ...baseOptions, sample_rate: 48000, channels: 'mono' },
      'in.mp3',
      'out.mp3',
    );
    expect(args[args.indexOf('-ar') + 1]).toBe('48000');
    expect(args[args.indexOf('-ac') + 1]).toBe('1');
  });

  it('adds -map_metadata -1 only when remove_metadata is set', () => {
    const withRemoval = buildConvertArgs({ ...baseOptions, remove_metadata: true }, 'in.mp3', 'out.mp3');
    expect(withRemoval).toContain('-map_metadata');
    const without = buildConvertArgs(baseOptions, 'in.mp3', 'out.mp3');
    expect(without).not.toContain('-map_metadata');
  });

  it('adds a loudnorm filter only when normalize is set', () => {
    const args = buildConvertArgs({ ...baseOptions, normalize: true }, 'in.mp3', 'out.mp3');
    expect(args[args.indexOf('-af') + 1]).toContain('loudnorm');
  });

  it.each(CONVERT_AUDIO_FORMATS)('produces a runnable arg list for every format (%s)', (format) => {
    const args = buildConvertArgs({ ...baseOptions, format }, 'in.mp3', `out.${format}`);
    expect(args[0]).toBe('-i');
    expect(args[args.length - 1]).toContain('out.');
  });
});

describe('convertOutputFileName', () => {
  it('swaps the extension to match the chosen format', () => {
    expect(convertOutputFileName('song.wav', 'mp3')).toBe('song.mp3');
    expect(convertOutputFileName('song.mp3', 'm4a')).toBe('song.m4a');
  });
});

describe('isLossless', () => {
  it('flags WAV and FLAC only', () => {
    expect(isLossless('wav')).toBe(true);
    expect(isLossless('flac')).toBe(true);
    expect(isLossless('mp3')).toBe(false);
  });
});

describe('computeWaveformPeaks', () => {
  it('returns one peak per bucket, each within 0..1', () => {
    const samples = new Float32Array(1000).map((_, i) => Math.sin(i / 10));
    const peaks = computeWaveformPeaks(samples, 50);
    expect(peaks.length).toBe(50);
    for (const value of peaks) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('returns all zeros for empty input', () => {
    const peaks = computeWaveformPeaks(new Float32Array(0), 10);
    expect(peaks.length).toBe(10);
    expect([...peaks].every((v) => v === 0)).toBe(true);
  });
});

describe('formatTime', () => {
  it('formats minutes, seconds and tenths', () => {
    expect(formatTime(135.6)).toBe('02:15.6');
    expect(formatTime(0)).toBe('00:00.0');
    expect(formatTime(324)).toBe('05:24.0');
  });
});
