import { describe, expect, it } from 'vitest';
import { codecForExtension, resolveOutputSpec } from '@/features/audio/merge_audio/formats';
import { buildMergeArgs, mergeOutputFileName, type MergeAudioOptions } from '@/features/audio/merge_audio/processor';

const gapOptions: MergeAudioOptions = {
  clip_volumes: [100, 100],
  join_mode: 'gap',
  join_seconds: 1.5,
};

describe('resolveOutputSpec', () => {
  it('keeps a shared extension across every clip', () => {
    expect(resolveOutputSpec(['mp3', 'mp3', 'mp3']).extension).toBe('mp3');
    expect(resolveOutputSpec(['wav', 'wav']).extension).toBe('wav');
  });

  it('falls back to mp3 for a mixed set', () => {
    expect(resolveOutputSpec(['mp3', 'wav']).extension).toBe('mp3');
  });
});

describe('codecForExtension', () => {
  it('flags lossless containers', () => {
    expect(codecForExtension('flac').lossless).toBe(true);
    expect(codecForExtension('mp3').lossless).toBe(false);
  });
});

describe('buildMergeArgs', () => {
  const spec = codecForExtension('mp3');

  it('inserts a trimmed silent input between every pair of clips in gap mode', () => {
    const args = buildMergeArgs(gapOptions, 3, 'out.mp3', spec);
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain('atrim=duration=1.5[g0]');
    expect(filter).toContain('atrim=duration=1.5[g1]');
    expect(filter).toContain('concat=n=5:v=0:a=1[merged]');
    expect(args).toContain('-map');
    expect(args[args.indexOf('-map') + 1]).toBe('[merged]');
  });

  it('concatenates directly when the gap is zero', () => {
    const args = buildMergeArgs({ ...gapOptions, join_seconds: 0 }, 2, 'out.mp3', spec);
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).not.toContain('atrim=duration');
    expect(filter).toContain('concat=n=2:v=0:a=1[merged]');
  });

  it('chains acrossfade for crossfade mode', () => {
    const options: MergeAudioOptions = { clip_volumes: [100, 100, 100], join_mode: 'crossfade', join_seconds: 2 };
    const args = buildMergeArgs(options, 3, 'out.mp3', spec);
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain('acrossfade=d=2:c1=tri:c2=tri[x1]');
    expect(filter).toContain('acrossfade=d=2:c1=tri:c2=tri[x2]');
    expect(args[args.indexOf('-map') + 1]).toBe('[x2]');
  });

  it('applies each clip volume as a fraction', () => {
    const options: MergeAudioOptions = { clip_volumes: [50, 100], join_mode: 'gap', join_seconds: 0 };
    const args = buildMergeArgs(options, 2, 'out.mp3', spec);
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain('[0:a]volume=0.5,');
    expect(filter).toContain('[1:a]volume=1,');
  });

  it('skips the join filter entirely for a single clip', () => {
    const args = buildMergeArgs({ ...gapOptions, join_seconds: 0 }, 1, 'out.mp3', spec);
    expect(args[args.indexOf('-map') + 1]).toBe('[a0]');
  });

  it('adds -b:a for a lossy output, skips it for a lossless one', () => {
    const lossy = buildMergeArgs(gapOptions, 2, 'out.mp3', spec);
    expect(lossy).toContain('-b:a');
    const lossless = buildMergeArgs(gapOptions, 2, 'out.wav', codecForExtension('wav'));
    expect(lossless).not.toContain('-b:a');
  });
});

describe('mergeOutputFileName', () => {
  it('names the merged file with the resolved extension', () => {
    expect(mergeOutputFileName('mp3')).toBe('merged-audio.mp3');
  });
});
