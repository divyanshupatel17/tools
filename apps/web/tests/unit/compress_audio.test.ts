import { describe, expect, it } from 'vitest';
import { detectCompressFormat } from '@/features/audio/compress_audio/formats';
import {
  buildCompressArgs,
  qualityToKbps,
  resolveBitrateKbps,
  type CompressAudioOptions,
} from '@/features/audio/compress_audio/processor';

const baseOptions: CompressAudioOptions = {
  mode: 'quality',
  quality: 70,
  sample_rate: 'source',
  channels: 'source',
};

describe('detectCompressFormat', () => {
  it('keeps M4A/AAC and OGG sources in their own format', () => {
    expect(detectCompressFormat('m4a')).toBe('m4a');
    expect(detectCompressFormat('aac')).toBe('m4a');
    expect(detectCompressFormat('ogg')).toBe('ogg');
  });

  it('sends everything else, lossless or not, to MP3', () => {
    expect(detectCompressFormat('wav')).toBe('mp3');
    expect(detectCompressFormat('flac')).toBe('mp3');
    expect(detectCompressFormat('mp3')).toBe('mp3');
    expect(detectCompressFormat('wma')).toBe('mp3');
  });
});

describe('qualityToKbps', () => {
  it('maps 1 to the floor and 100 to the ceiling', () => {
    expect(qualityToKbps(1)).toBeGreaterThanOrEqual(32);
    expect(qualityToKbps(100)).toBe(320);
  });

  it('clamps out of range input', () => {
    expect(qualityToKbps(-50)).toBe(qualityToKbps(1));
    expect(qualityToKbps(500)).toBe(qualityToKbps(100));
  });
});

describe('resolveBitrateKbps', () => {
  it('uses the quality mapping in quality mode', () => {
    const resolved = resolveBitrateKbps({ ...baseOptions, mode: 'quality', quality: 100 });
    expect(resolved).toEqual({ kbps: 320, hit_target: true });
  });

  it('uses the exact number in bitrate mode, clamped to 32..320', () => {
    expect(resolveBitrateKbps({ ...baseOptions, mode: 'bitrate', bitrate_kbps: 160 }).kbps).toBe(160);
    expect(resolveBitrateKbps({ ...baseOptions, mode: 'bitrate', bitrate_kbps: 10 }).kbps).toBe(32);
    expect(resolveBitrateKbps({ ...baseOptions, mode: 'bitrate', bitrate_kbps: 999 }).kbps).toBe(320);
  });

  it('derives an average bitrate from target size and duration', () => {
    // 1 MB over 60s ≈ 136 kbps.
    const resolved = resolveBitrateKbps({
      ...baseOptions,
      mode: 'target_size',
      target_size_mb: 1,
      duration_seconds: 60,
    });
    expect(resolved.kbps).toBe(Math.round((1 * 1024 * 1024 * 8) / 60 / 1000));
  });
});

describe('buildCompressArgs', () => {
  it('builds a codec and bitrate pair for the resolved format', () => {
    const args = buildCompressArgs(baseOptions, 'mp3', 'in.mp3', 'out.mp3');
    expect(args[0]).toBe('-i');
    expect(args).toContain('libmp3lame');
    expect(args).toContain('-b:a');
  });

  it('adds -ar and -ac only when not left as source', () => {
    const args = buildCompressArgs(
      { ...baseOptions, sample_rate: 32000, channels: 'mono' },
      'mp3',
      'in.mp3',
      'out.mp3',
    );
    expect(args[args.indexOf('-ar') + 1]).toBe('32000');
    expect(args[args.indexOf('-ac') + 1]).toBe('1');
  });

  it('omits -ar and -ac when left as source', () => {
    const args = buildCompressArgs(baseOptions, 'mp3', 'in.mp3', 'out.mp3');
    expect(args).not.toContain('-ar');
    expect(args).not.toContain('-ac');
  });
});
