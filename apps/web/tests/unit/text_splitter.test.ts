import { describe, expect, it } from 'vitest';
import { joinItems, joinLines, splitText } from '@/lib/text/text_splitter';

describe('splitText', () => {
  it('splits on newline by default', () => {
    expect(splitText('a\nb\nc', {})).toEqual(['a', 'b', 'c']);
  });

  it('splits on comma', () => {
    expect(splitText('a,b,c', { split_delimiter: 'comma' })).toEqual(['a', 'b', 'c']);
  });

  it('splits on space', () => {
    expect(splitText('a b c', { split_delimiter: 'space' })).toEqual(['a', 'b', 'c']);
  });

  it('splits on a custom delimiter', () => {
    expect(
      splitText('a|b|c', { split_delimiter: 'custom', custom_split_delimiter: '|' }),
    ).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace from each item by default', () => {
    expect(splitText('a , b ,c', { split_delimiter: 'comma' })).toEqual(['a', 'b', 'c']);
  });

  it('keeps whitespace when trim is off', () => {
    expect(
      splitText('a , b', { split_delimiter: 'comma', trim_whitespace: false }),
    ).toEqual(['a ', ' b']);
  });

  it('removes empty items by default', () => {
    expect(splitText('a\n\nb', {})).toEqual(['a', 'b']);
  });

  it('keeps empty items when asked to', () => {
    expect(splitText('a\n\nb', { remove_empty: false })).toEqual(['a', '', 'b']);
  });

  it('treats an empty custom delimiter as no split at all', () => {
    expect(splitText('a b c', { split_delimiter: 'custom', custom_split_delimiter: '' })).toEqual([
      'a b c',
    ]);
  });
});

describe('joinItems', () => {
  it('joins with the given delimiter', () => {
    expect(joinItems(['a', 'b', 'c'], { join_delimiter: ', ' })).toBe('a, b, c');
  });

  it('joins with an empty delimiter by default', () => {
    expect(joinItems(['a', 'b'], {})).toBe('ab');
  });

  it('trims and drops empty items before joining, same as split', () => {
    expect(joinItems([' a ', '', 'b '], { join_delimiter: '-' })).toBe('a-b');
  });
});

describe('joinLines', () => {
  it('treats the text as one item per line, regardless of the split delimiter setting', () => {
    expect(joinLines('a\nb\nc', { join_delimiter: '-', split_delimiter: 'comma' })).toBe('a-b-c');
  });
});
