import { describe, expect, it } from 'vitest';
import { computeDiff, formatUnifiedDiff, MAX_DIFF_LINES } from '@/lib/text/text_diff';

const NO_IGNORE = { ignore_case: false, ignore_whitespace: false };

describe('computeDiff', () => {
  it('marks identical text as fully unchanged', () => {
    const result = computeDiff('a\nb\nc', 'a\nb\nc', NO_IGNORE);
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 3 });
    expect(result.side_by_side.every((row) => row.type === 'equal')).toBe(true);
  });

  it('reports a pure addition as added, not modified', () => {
    const result = computeDiff('a\nc', 'a\nb\nc', NO_IGNORE);
    expect(result.summary).toEqual({ added: 1, removed: 0, modified: 0, unchanged: 2 });
  });

  it('reports a pure removal as removed', () => {
    const result = computeDiff('a\nb\nc', 'a\nc', NO_IGNORE);
    expect(result.summary).toEqual({ added: 0, removed: 1, modified: 0, unchanged: 2 });
  });

  it('pairs a like-for-like line change as modified in the side by side rows', () => {
    const result = computeDiff('hello world', 'goodbye world', NO_IGNORE);
    expect(result.side_by_side).toEqual([
      {
        type: 'modified',
        left: { number: 1, text: 'hello world' },
        right: { number: 1, text: 'goodbye world' },
      },
    ]);
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 1, unchanged: 0 });
  });

  it('splits the unified view into raw add and remove lines for a modified pair', () => {
    const result = computeDiff('hello world', 'goodbye world', NO_IGNORE);
    expect(result.unified).toEqual([
      { type: 'removed', left_number: 1, right_number: null, text: 'hello world' },
      { type: 'added', left_number: null, right_number: 1, text: 'goodbye world' },
    ]);
  });

  it('ignores case differences when ignore_case is set', () => {
    const result = computeDiff('Hello', 'hello', { ignore_case: true, ignore_whitespace: false });
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 1 });
  });

  it('keeps the original casing visible even when ignoring it for comparison', () => {
    const result = computeDiff('Hello', 'hello', { ignore_case: true, ignore_whitespace: false });
    expect(result.side_by_side[0]!.left!.text).toBe('Hello');
    expect(result.side_by_side[0]!.right!.text).toBe('hello');
  });

  it('ignores whitespace differences when ignore_whitespace is set', () => {
    const result = computeDiff('a   b', 'a b', { ignore_case: false, ignore_whitespace: true });
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 1 });
  });

  it('treats empty input as no lines rather than one empty line', () => {
    const result = computeDiff('', '', NO_IGNORE);
    expect(result.side_by_side).toEqual([]);
  });

  it('flags truncation once either side exceeds the line cap', () => {
    const big = Array.from({ length: MAX_DIFF_LINES + 5 }, (_, i) => `line ${i}`).join('\n');
    const result = computeDiff(big, big, NO_IGNORE);
    expect(result.truncated).toBe(true);
  });
});

describe('formatUnifiedDiff', () => {
  it('renders a classic --- / +++ / +- unified diff', () => {
    const result = computeDiff('a\nb', 'a\nc', NO_IGNORE);
    const text = formatUnifiedDiff(result, 'Original', 'Modified');
    expect(text).toBe('--- Original\n+++ Modified\n a\n-b\n+c');
  });
});
