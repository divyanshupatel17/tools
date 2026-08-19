import { describe, expect, it } from 'vitest';
import { timeTicks } from '@/lib/video/timeline';

describe('timeTicks', () => {
  it('produces evenly spaced ticks ending at the duration', () => {
    const ticks = timeTicks(60);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(60);
  });

  // A raw MediaRecorder WebM reports Infinity for its own duration until the browser is forced
  // to seek near the end (see readVideoMeta in lib/video/video_formats.ts); before that happens,
  // an Infinite or NaN duration must never reach here and spin an unbounded `for` loop.
  it('never spins an unbounded loop for a non-finite duration', () => {
    expect(timeTicks(Infinity)).toEqual([0]);
    expect(timeTicks(NaN)).toEqual([0]);
    expect(timeTicks(-Infinity)).toEqual([0]);
  });

  it('returns a single zero tick for a zero or negative duration', () => {
    expect(timeTicks(0)).toEqual([0]);
    expect(timeTicks(-5)).toEqual([0]);
  });
});
