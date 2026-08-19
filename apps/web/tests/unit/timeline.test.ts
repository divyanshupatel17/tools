import { beforeEach, describe, expect, it } from 'vitest';
import {
  duplicateOrder,
  formatOrderedSegments,
  initialSegments,
  insertAfter,
  mergeBoundary,
  moveBoundary,
  moveOrder,
  nextOrderedIndexFrom,
  orderedIndexAt,
  removeSegment,
  reorderOutput,
  resetSegmentIds,
  sequenceToSource,
  sourceToSequence,
  splitAt,
  syncOrder,
  toggleKeep,
} from '@/lib/video/timeline';

beforeEach(() => resetSegmentIds());

describe('initialSegments', () => {
  it('starts as one kept segment spanning the whole clip', () => {
    expect(initialSegments(10)).toEqual([{ id: 1, start: 0, end: 10, keep: true }]);
  });
});

describe('splitAt', () => {
  it('splits the segment containing the given time into two', () => {
    const segments = splitAt(initialSegments(10), 4);
    expect(segments).toEqual([
      { id: 1, start: 0, end: 4, keep: true },
      { id: 2, start: 4, end: 10, keep: true },
    ]);
  });

  it('does nothing when the time is too close to an existing edge', () => {
    const segments = initialSegments(10);
    expect(splitAt(segments, 0.05)).toEqual(segments);
    expect(splitAt(segments, 9.95)).toEqual(segments);
  });

  it('splits the correct segment among several', () => {
    let segments = splitAt(initialSegments(10), 4); // [0-4][4-10]
    segments = splitAt(segments, 7); // [0-4][4-7][7-10]
    expect(segments.map((s) => [s.start, s.end])).toEqual([
      [0, 4],
      [4, 7],
      [7, 10],
    ]);
  });
});

describe('mergeBoundary', () => {
  it('joins two adjacent segments and keeps the left one\'s keep flag', () => {
    const segments = [
      { id: 1, start: 0, end: 4, keep: false },
      { id: 2, start: 4, end: 10, keep: true },
    ];
    expect(mergeBoundary(segments, 0)).toEqual([{ id: 1, start: 0, end: 10, keep: false }]);
  });
});

describe('moveBoundary', () => {
  it('moves the shared edge between two segments', () => {
    const segments = [
      { id: 1, start: 0, end: 4, keep: true },
      { id: 2, start: 4, end: 10, keep: true },
    ];
    const next = moveBoundary(segments, 0, 6);
    expect(next).toEqual([
      { id: 1, start: 0, end: 6, keep: true },
      { id: 2, start: 6, end: 10, keep: true },
    ]);
  });

  it('clamps so neither segment shrinks below the minimum size', () => {
    const segments = [
      { id: 1, start: 0, end: 4, keep: true },
      { id: 2, start: 4, end: 10, keep: true },
    ];
    const next = moveBoundary(segments, 0, 9.99);
    expect(next[1]?.start).toBeCloseTo(9.8, 5);
  });
});

describe('toggleKeep', () => {
  it('flips only the matching segment', () => {
    const segments = [
      { id: 1, start: 0, end: 4, keep: true },
      { id: 2, start: 4, end: 10, keep: true },
    ];
    expect(toggleKeep(segments, 2)).toEqual([
      { id: 1, start: 0, end: 4, keep: true },
      { id: 2, start: 4, end: 10, keep: false },
    ]);
  });
});

describe('syncOrder', () => {
  it('preserves a hand made order for segments still kept', () => {
    const segments = [
      { id: 1, start: 0, end: 4, keep: true },
      { id: 2, start: 4, end: 8, keep: true },
      { id: 3, start: 8, end: 10, keep: true },
    ];
    expect(syncOrder(segments, [3, 1, 2])).toEqual([3, 1, 2]);
  });

  it('drops ids that are no longer kept', () => {
    const segments = [
      { id: 1, start: 0, end: 4, keep: true },
      { id: 2, start: 4, end: 8, keep: false },
    ];
    expect(syncOrder(segments, [1, 2])).toEqual([1]);
  });

  it('appends newly kept ids at the end instead of resetting the order', () => {
    const segments = [
      { id: 1, start: 0, end: 4, keep: true },
      { id: 2, start: 4, end: 8, keep: true },
    ];
    expect(syncOrder(segments, [1])).toEqual([1, 2]);
  });
});

describe('moveOrder', () => {
  it('swaps a segment with its neighbour', () => {
    expect(moveOrder([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveOrder([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
  });

  it('does nothing past either end', () => {
    expect(moveOrder([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveOrder([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });
});

describe('duplicateOrder', () => {
  it('repeats the id right after its own position', () => {
    expect(duplicateOrder([1, 2, 3], 0)).toEqual([1, 1, 2, 3]);
    expect(duplicateOrder([1, 2, 3], 2)).toEqual([1, 2, 3, 3]);
  });
});

describe('insertAfter', () => {
  it('inserts a brand new id right after its sibling, wherever that sibling now sits', () => {
    // Reproduces the ABCD -> split AB|CD -> reorder CD,AB -> split CD -> C,D,AB case.
    expect(insertAfter([2, 1], 2, 3)).toEqual([2, 3, 1]);
  });

  it('moves the id there if it already exists elsewhere in the order', () => {
    expect(insertAfter([1, 2, 3], 1, 3)).toEqual([1, 3, 2]);
  });

  it('appends when the sibling is not present', () => {
    expect(insertAfter([1, 2], 9, 3)).toEqual([1, 2, 3]);
  });
});

describe('removeSegment', () => {
  it('hands the removed range to the previous segment', () => {
    const segments = [
      { id: 1, start: 0, end: 4, keep: true },
      { id: 2, start: 4, end: 6, keep: false },
      { id: 3, start: 6, end: 10, keep: true },
    ];
    expect(removeSegment(segments, 2)).toEqual([
      { id: 1, start: 0, end: 6, keep: true },
      { id: 3, start: 6, end: 10, keep: true },
    ]);
  });

  it('hands the removed range to the next segment when it is the first one', () => {
    const segments = [
      { id: 1, start: 0, end: 4, keep: false },
      { id: 2, start: 4, end: 10, keep: true },
    ];
    expect(removeSegment(segments, 1)).toEqual([{ id: 2, start: 0, end: 10, keep: true }]);
  });

  it('does nothing when it is the only segment', () => {
    const segments = [{ id: 1, start: 0, end: 10, keep: true }];
    expect(removeSegment(segments, 1)).toEqual(segments);
  });
});

describe('sequenceToSource', () => {
  it('maps a position on the output sequence back to the clip it plays from', () => {
    // Output order: green(3-6), blue(6-9), red(0-3) — the reordered case from real usage.
    const ordered = [
      { start: 3, end: 6 },
      { start: 6, end: 9 },
      { start: 0, end: 3 },
    ];
    expect(sequenceToSource(ordered, 0)).toBe(3); // start of green
    expect(sequenceToSource(ordered, 1)).toBe(4); // 1s into green
    expect(sequenceToSource(ordered, 3)).toBe(6); // start of blue
    expect(sequenceToSource(ordered, 6)).toBe(0); // start of red
    expect(sequenceToSource(ordered, 8)).toBe(2); // 2s into red
  });

  it('clamps past the end to the last clip', () => {
    const ordered = [{ start: 0, end: 3 }];
    expect(sequenceToSource(ordered, 10)).toBe(3);
  });
});

describe('sourceToSequence', () => {
  it('maps a source time to its position on the output sequence', () => {
    const ordered = [
      { start: 3, end: 6 },
      { start: 6, end: 9 },
      { start: 0, end: 3 },
    ];
    expect(sourceToSequence(ordered, 4)).toBe(1);
    expect(sourceToSequence(ordered, 6)).toBe(3);
    expect(sourceToSequence(ordered, 1)).toBe(7);
  });

  it('returns null for a time that is not part of the output', () => {
    const ordered = [{ start: 3, end: 6 }];
    expect(sourceToSequence(ordered, 8)).toBeNull();
  });
});

describe('formatOrderedSegments', () => {
  it('resolves ids to start/end pairs in order', () => {
    const segments = [
      { id: 1, start: 0, end: 4, keep: true },
      { id: 2, start: 4, end: 10, keep: true },
    ];
    expect(formatOrderedSegments(segments, [2, 1])).toEqual([
      { start: 4, end: 10 },
      { start: 0, end: 4 },
    ]);
  });
});

describe('orderedIndexAt', () => {
  it('finds the output index of the clip containing the given time', () => {
    const ordered = [
      { start: 4, end: 10 },
      { start: 0, end: 4 },
    ];
    expect(orderedIndexAt(ordered, 5)).toBe(0);
    expect(orderedIndexAt(ordered, 1)).toBe(1);
  });

  it('returns -1 for a time outside every clip', () => {
    const ordered = [{ start: 4, end: 10 }];
    expect(orderedIndexAt(ordered, 2)).toBe(-1);
  });
});

describe('nextOrderedIndexFrom', () => {
  it('finds the next clip starting at or after the given time', () => {
    const ordered = [
      { start: 4, end: 10 },
      { start: 0, end: 4 },
    ];
    expect(nextOrderedIndexFrom(ordered, 1)).toBe(0);
    expect(nextOrderedIndexFrom(ordered, 4)).toBe(0);
  });

  it('returns -1 when nothing starts that late', () => {
    const ordered = [{ start: 0, end: 4 }];
    expect(nextOrderedIndexFrom(ordered, 5)).toBe(-1);
  });
});

describe('reorderOutput', () => {
  it('moves an id to a new position, shifting the rest', () => {
    expect(reorderOutput([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(reorderOutput([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
  });

  it('does nothing for a no-op or out of range move', () => {
    expect(reorderOutput([1, 2, 3], 1, 1)).toEqual([1, 2, 3]);
    expect(reorderOutput([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
  });
});
