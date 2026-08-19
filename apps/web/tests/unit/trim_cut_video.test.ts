import { describe, expect, it } from 'vitest';
import { buildMergeArgs, buildSplitArgs } from '@/features/video/trim_cut_video/processor';

describe('buildMergeArgs', () => {
  it('builds one trim/atrim pair per segment plus a concat', () => {
    const args = buildMergeArgs(
      [
        { start: 0, end: 4 },
        { start: 8, end: 10 },
      ],
      'in.mp4',
      'out.mp4',
      true,
    );
    const filter = args[args.indexOf('-filter_complex') + 1];
    expect(filter).toContain('trim=start=0.000:end=4.000');
    expect(filter).toContain('trim=start=8.000:end=10.000');
    expect(filter).toContain('concat=n=2:v=1:a=1[outv][outa]');
    expect(args).toContain('-map');
    expect(args[args.indexOf('-map') + 1]).toBe('[outv]');
  });

  it('keeps the given order, not sorted by start time', () => {
    const args = buildMergeArgs(
      [
        { start: 8, end: 10 },
        { start: 0, end: 4 },
      ],
      'in.mp4',
      'out.mp4',
      true,
    );
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    // The segment starting at 8 must appear as [v0], the one starting at 0 as [v1].
    expect(filter.indexOf('start=8.000')).toBeLessThan(filter.indexOf('start=0.000'));
  });

  it('supports a single kept segment as a trivial one-way concat', () => {
    const args = buildMergeArgs([{ start: 1, end: 2 }], 'in.mp4', 'out.mp4', true);
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain('concat=n=1:v=1:a=1');
  });

  it('drops every audio filter, map and codec when the source has no audio stream', () => {
    const args = buildMergeArgs(
      [
        { start: 0, end: 4 },
        { start: 8, end: 10 },
      ],
      'in.mp4',
      'out.mp4',
      false,
    );
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).not.toContain('atrim');
    expect(filter).not.toContain('[outa]');
    expect(filter).toContain('concat=n=2:v=1:a=0[outv]');
    expect(args).not.toContain('[outa]');
    expect(args).not.toContain('-c:a');
  });
});

describe('buildSplitArgs', () => {
  it('trims with output side seeking for frame accuracy', () => {
    const args = buildSplitArgs({ start: 2.5, end: 6 }, 'in.mp4', 'part0.mp4', true);
    expect(args.slice(0, 2)).toEqual(['-i', 'in.mp4']);
    expect(args[args.indexOf('-ss') + 1]).toBe('2.500');
    expect(args[args.indexOf('-to') + 1]).toBe('6.000');
    expect(args.at(-1)).toBe('part0.mp4');
    expect(args).toContain('-c:a');
  });

  it('never emits a negative start time', () => {
    const args = buildSplitArgs({ start: -1, end: 3 }, 'in.mp4', 'part0.mp4', true);
    expect(args[args.indexOf('-ss') + 1]).toBe('0.000');
  });

  it('drops the audio codec and adds -an when the source has no audio stream', () => {
    const args = buildSplitArgs({ start: 0, end: 3 }, 'in.mp4', 'part0.mp4', false);
    expect(args).not.toContain('-c:a');
    expect(args).toContain('-an');
  });
});
