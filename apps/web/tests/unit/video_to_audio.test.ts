import { describe, expect, it } from 'vitest';
import { parseTime } from '@/lib/audio/audio_formats';
import { EXTRACT_FORMATS, isLossless } from '@/features/audio/video_to_audio/formats';
import {
  buildExtractArgs,
  extractOutputFileName,
  type VideoToAudioOptions,
} from '@/features/audio/video_to_audio/processor';

const baseOptions: VideoToAudioOptions = {
  format: 'mp3',
  quality: 'best',
  sample_rate: 'source',
  channels: 'source',
  start_seconds: 0,
  end_seconds: 10,
};

describe('buildExtractArgs', () => {
  it('builds a lossy codec and bitrate pair, dropping video with -vn', () => {
    const args = buildExtractArgs(baseOptions, 'in.mp4', 'out.mp3');
    expect(args).toContain('-vn');
    expect(args).toContain('libmp3lame');
    expect(args).toContain('-b:a');
    expect(args).not.toContain('-c:v');
  });

  it('omits -ss when the selection starts at 0', () => {
    const args = buildExtractArgs(baseOptions, 'in.mp4', 'out.mp3');
    expect(args).not.toContain('-ss');
  });

  it('adds -ss and a -t duration matching the selected range', () => {
    const args = buildExtractArgs(
      { ...baseOptions, start_seconds: 5, end_seconds: 15 },
      'in.mp4',
      'out.mp3',
    );
    expect(args[args.indexOf('-ss') + 1]).toBe('5');
    expect(args[args.indexOf('-t') + 1]).toBe('10');
  });

  it('skips -b:a for a lossless format', () => {
    const args = buildExtractArgs({ ...baseOptions, format: 'wav' }, 'in.mp4', 'out.wav');
    expect(args).toContain('pcm_s16le');
    expect(args).not.toContain('-b:a');
  });

  it('adds -ar and -ac only when not left as source', () => {
    const args = buildExtractArgs(
      { ...baseOptions, sample_rate: 48000, channels: 'mono' },
      'in.mp4',
      'out.mp3',
    );
    expect(args[args.indexOf('-ar') + 1]).toBe('48000');
    expect(args[args.indexOf('-ac') + 1]).toBe('1');
  });

  it.each(EXTRACT_FORMATS)('produces a runnable arg list for every format (%s)', (format) => {
    const args = buildExtractArgs({ ...baseOptions, format }, 'in.mp4', `out.${format}`);
    expect(args).toContain('-i');
    expect(args[args.length - 1]).toContain(`out.${format}`);
  });
});

describe('extractOutputFileName', () => {
  it('swaps the extension to match the chosen format', () => {
    expect(extractOutputFileName('clip.mp4', 'mp3')).toBe('clip.mp3');
    expect(extractOutputFileName('clip.mov', 'aiff')).toBe('clip.aiff');
  });
});

describe('isLossless', () => {
  it('flags WAV, FLAC and AIFF only', () => {
    expect(isLossless('wav')).toBe(true);
    expect(isLossless('flac')).toBe(true);
    expect(isLossless('aiff')).toBe(true);
    expect(isLossless('mp3')).toBe(false);
  });
});

describe('parseTime', () => {
  it('parses mm:ss.d', () => {
    expect(parseTime('02:15.6')).toBeCloseTo(135.6);
  });

  it('parses m:ss without a leading zero', () => {
    expect(parseTime('1:05')).toBe(65);
  });

  it('parses a plain number of seconds', () => {
    expect(parseTime('90')).toBe(90);
    expect(parseTime('90.5')).toBe(90.5);
  });

  it('returns null for unparsable text', () => {
    expect(parseTime('')).toBeNull();
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('-')).toBeNull();
  });
});
