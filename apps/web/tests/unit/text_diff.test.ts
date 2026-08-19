import { describe, expect, it } from 'vitest';
import { diffLines, diffPages } from '@/lib/pdf/text_diff';

describe('diffLines', () => {
  it('reports no changes for identical input', () => {
    const diff = diffLines(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(diff.every((line) => line.type === 'equal')).toBe(true);
  });

  it('finds an added line in the middle', () => {
    const diff = diffLines(['a', 'c'], ['a', 'b', 'c']);
    expect(diff).toEqual([
      { type: 'equal', text: 'a' },
      { type: 'added', text: 'b' },
      { type: 'equal', text: 'c' },
    ]);
  });

  it('finds a removed line', () => {
    const diff = diffLines(['a', 'b', 'c'], ['a', 'c']);
    expect(diff).toEqual([
      { type: 'equal', text: 'a' },
      { type: 'removed', text: 'b' },
      { type: 'equal', text: 'c' },
    ]);
  });

  it('handles an entirely replaced line as remove+add, not a false equal', () => {
    const diff = diffLines(['hello world'], ['goodbye world']);
    expect(diff).toEqual([
      { type: 'removed', text: 'hello world' },
      { type: 'added', text: 'goodbye world' },
    ]);
  });
});

describe('diffPages', () => {
  it('marks a page unchanged only when every line matches', () => {
    const summaries = diffPages([['a', 'b']], [['a', 'b']]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.changed).toBe(false);
  });

  it('treats a page present only in the second document as fully added', () => {
    const summaries = diffPages([['a']], [['a'], ['new page']]);
    expect(summaries).toHaveLength(2);
    expect(summaries[1]!.changed).toBe(true);
    expect(summaries[1]!.linesAdded).toBe(1);
    expect(summaries[1]!.linesRemoved).toBe(0);
  });
});
