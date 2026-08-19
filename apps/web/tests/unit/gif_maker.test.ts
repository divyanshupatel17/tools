import { describe, expect, it } from 'vitest';
import {
  buildGifMakerArgs,
  MAX_FPS,
  MAX_WIDTH,
  MIN_FPS,
  MIN_WIDTH,
} from '@/features/video/gif_maker/processor';

describe('buildGifMakerArgs', () => {
  it('trims to the given range with -ss/-to before -i, and builds a palette filter graph', () => {
    const args = buildGifMakerArgs({ start: 2, end: 5, fps: 12, width: 480 }, 'in.mp4', 'out.gif');
    expect(args.slice(0, 5)).toEqual(['-ss', '2.000', '-to', '5.000', '-i']);
    expect(args).toContain('-an');
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain('fps=12');
    expect(filter).toContain('scale=480:-1');
    expect(filter).toContain('palettegen');
    expect(filter).toContain('paletteuse');
    expect(args[args.length - 1]).toBe('out.gif');
  });

  it('never lets the trimmed range collapse to zero length', () => {
    const args = buildGifMakerArgs({ start: 5, end: 5, fps: 12, width: 480 }, 'in.mp4', 'out.gif');
    const start = Number(args[1]);
    const end = Number(args[3]);
    expect(end).toBeGreaterThan(start);
  });

  it('clamps frame rate and width to their supported bounds', () => {
    const tooFast = buildGifMakerArgs({ start: 0, end: 1, fps: 999, width: 50 }, 'in.mp4', 'out.gif');
    const filterFast = tooFast[tooFast.indexOf('-filter_complex') + 1] ?? '';
    expect(filterFast).toContain(`fps=${MAX_FPS}`);
    expect(filterFast).toContain(`scale=${MIN_WIDTH}:-1`);

    const tooSlow = buildGifMakerArgs({ start: 0, end: 1, fps: 0, width: 5000 }, 'in.mp4', 'out.gif');
    const filterSlow = tooSlow[tooSlow.indexOf('-filter_complex') + 1] ?? '';
    expect(filterSlow).toContain(`fps=${MIN_FPS}`);
    expect(filterSlow).toContain(`scale=${MAX_WIDTH}:-1`);
  });

  it('never starts before zero even if given a negative start', () => {
    const args = buildGifMakerArgs({ start: -5, end: 3, fps: 12, width: 480 }, 'in.mp4', 'out.gif');
    expect(args[1]).toBe('0.000');
  });
});
