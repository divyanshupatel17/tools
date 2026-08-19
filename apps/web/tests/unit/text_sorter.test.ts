import { describe, expect, it } from 'vitest';
import { countLineStats, sortLines } from '@/lib/text/text_sorter';

const FRUIT = 'Banana\napple\nOrange\ngrape\nBanana\nkiwi';

describe('sortLines', () => {
  it('sorts lines with plain ASCII order, not locale collation', () => {
    // Uppercase sorts before lowercase in ASCII, so "Banana"/"Orange" come before "apple".
    expect(sortLines(FRUIT, 'az')).toBe('Banana\nBanana\nOrange\napple\ngrape\nkiwi');
  });

  it('reverses that same order for Z to A', () => {
    expect(sortLines(FRUIT, 'za')).toBe('kiwi\ngrape\napple\nOrange\nBanana\nBanana');
  });

  it('sorts numerically, treating non numeric lines as zero', () => {
    expect(sortLines('10\n2\n1', 'numeric')).toBe('1\n2\n10');
  });

  it('sorts naturally so item 2 comes before item 10', () => {
    expect(sortLines('item 10\nitem 2\nitem 1', 'natural')).toBe('item 1\nitem 2\nitem 10');
  });

  it('shuffles to some permutation of the same lines', () => {
    const input = 'a\nb\nc\nd\ne';
    const result = sortLines(input, 'shuffle');
    expect(result.split('\n').sort()).toEqual(input.split('\n').sort());
  });

  it('removes duplicate lines, keeping the first occurrence order', () => {
    expect(sortLines(FRUIT, 'dedupe')).toBe('Banana\napple\nOrange\ngrape\nkiwi');
  });
});

describe('countLineStats', () => {
  it('returns all zeros for empty text', () => {
    expect(countLineStats('')).toEqual({ lines: 0, words: 0, uniqueLines: 0 });
  });

  it('counts lines, words and unique lines', () => {
    expect(countLineStats(FRUIT)).toEqual({ lines: 6, words: 6, uniqueLines: 5 });
  });
});
