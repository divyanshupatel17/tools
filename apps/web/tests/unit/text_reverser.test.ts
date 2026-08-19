import { describe, expect, it } from 'vitest';
import { reverseText } from '@/lib/text/text_reverser';

describe('reverseText', () => {
  it('reverses the entire text, including line breaks', () => {
    expect(reverseText('Hello\nworld', 'text')).toBe('dlrow\nolleH');
  });

  it('reverses the order of words on each line without touching their spelling', () => {
    expect(reverseText('The quick brown fox\nsecond line', 'words')).toBe(
      'fox brown quick The\nline second',
    );
  });

  it('reverses the letters of every word in place, keeping word order', () => {
    expect(reverseText('Hello world', 'letters')).toBe('olleH dlrow');
  });

  it('reverses the order of lines, keeping each line unchanged', () => {
    expect(reverseText('first\nsecond\nthird', 'lines')).toBe('third\nsecond\nfirst');
  });

  it('handles empty text for every mode without throwing', () => {
    for (const mode of ['text', 'words', 'letters', 'lines'] as const) {
      expect(() => reverseText('', mode)).not.toThrow();
    }
  });
});
