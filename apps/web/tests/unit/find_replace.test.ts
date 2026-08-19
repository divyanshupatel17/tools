import { describe, expect, it } from 'vitest';
import { findMatches, replaceAll, replaceOne } from '@/lib/text/find_replace';

describe('findMatches', () => {
  it('returns no matches for an empty find term', () => {
    expect(findMatches('hello world', '')).toEqual([]);
  });

  it('matches case insensitively by default', () => {
    expect(findMatches('Cat cat CAT', 'cat')).toHaveLength(3);
  });

  it('matches case sensitively when asked', () => {
    expect(findMatches('Cat cat CAT', 'cat', { case_sensitive: true })).toHaveLength(1);
  });

  it('matches only whole words when asked', () => {
    expect(findMatches('cat catalog cats', 'cat', { whole_word: true })).toHaveLength(1);
  });

  it('treats the find term as a literal string, not a pattern, unless regex is on', () => {
    expect(findMatches('a.b a.b axb', 'a.b')).toHaveLength(2);
  });

  it('treats the find term as a real pattern when regex is on', () => {
    expect(findMatches('a.b axb', 'a.b', { regex: true })).toHaveLength(2);
  });

  it('throws a friendly error for an invalid regular expression', () => {
    expect(() => findMatches('text', '(', { regex: true })).toThrow();
  });
});

describe('replaceAll', () => {
  it('replaces every match', () => {
    expect(replaceAll('cat cat cat', 'cat', 'dog')).toBe('dog dog dog');
  });

  it('returns the text unchanged when nothing matches', () => {
    expect(replaceAll('hello world', 'xyz', 'abc')).toBe('hello world');
  });
});

describe('replaceOne', () => {
  it('replaces the first match at or after fromIndex', () => {
    const result = replaceOne('cat cat cat', 'cat', 'dog', {}, 4);
    expect(result.text).toBe('cat dog cat');
    expect(result.replacedAt).toBe(4);
  });

  it('wraps around to the first match when fromIndex is past every match', () => {
    const result = replaceOne('cat cat', 'cat', 'dog', {}, 10);
    expect(result.text).toBe('dog cat');
    expect(result.replacedAt).toBe(0);
  });

  it('reports no replacement when nothing matches', () => {
    const result = replaceOne('hello', 'xyz', 'abc');
    expect(result.text).toBe('hello');
    expect(result.replacedAt).toBeNull();
  });
});
