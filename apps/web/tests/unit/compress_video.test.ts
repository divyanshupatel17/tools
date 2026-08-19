import { describe, expect, it } from 'vitest';
import { buildCompressArgs, qualityToCrf } from '@/features/video/compress_video/processor';

describe('qualityToCrf', () => {
  it('maps a higher quality to a lower CRF', () => {
    expect(qualityToCrf(100)).toBeLessThan(qualityToCrf(1));
  });

  it('clamps out of range input', () => {
    expect(qualityToCrf(1000)).toBe(qualityToCrf(100));
    expect(qualityToCrf(-50)).toBe(qualityToCrf(1));
  });
});

describe('buildCompressArgs', () => {
  it('builds a CRF command for quality mode', () => {
    const { args, hit_target } = buildCompressArgs({ mode: 'quality', quality: 60 }, 'in.mp4', 'out.mp4');
    expect(args).toContain('-crf');
    expect(args).toContain(String(qualityToCrf(60)));
    expect(hit_target).toBe(true);
  });

  it('builds an explicit bitrate command for bitrate mode', () => {
    const { args } = buildCompressArgs(
      { mode: 'bitrate', video_kbps: 3000, audio_kbps: 192 },
      'in.mp4',
      'out.mp4',
    );
    expect(args).toContain('-b:v');
    expect(args).toContain('3000k');
    expect(args).toContain('-b:a');
    expect(args).toContain('192k');
  });

  it('derives a bitrate from the target size and duration', () => {
    const { args, hit_target } = buildCompressArgs(
      { mode: 'target_size', target_size_mb: 10, duration_seconds: 60 },
      'in.mp4',
      'out.mp4',
    );
    const index = args.indexOf('-b:v');
    expect(index).toBeGreaterThan(-1);
    // 10 MiB over 60s is roughly 1398 kbps total, minus 128 kbps audio.
    expect(args[index + 1]).toBe('1270k');
    expect(hit_target).toBe(true);
  });

  it('reports it could not hit an unreasonably small target', () => {
    const { hit_target } = buildCompressArgs(
      { mode: 'target_size', target_size_mb: 0.2, duration_seconds: 600 },
      'in.mp4',
      'out.mp4',
    );
    expect(hit_target).toBe(false);
  });
});
