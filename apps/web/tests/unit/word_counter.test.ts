import { describe, expect, it } from 'vitest';
import { buildWordCountReport, countWords, formatDuration } from '@/lib/text/word_counter';

describe('countWords', () => {
  it('counts an empty text as all zeros', () => {
    const stats = countWords('');
    expect(stats.words).toBe(0);
    expect(stats.characters).toBe(0);
    expect(stats.sentences).toBe(0);
    expect(stats.paragraphs).toBe(0);
    expect(stats.lines).toBe(0);
  });

  it('counts words, characters, sentences and paragraphs', () => {
    const stats = countWords('Hello world. How are you?\n\nSecond paragraph here.');
    expect(stats.words).toBe(8);
    expect(stats.sentences).toBe(3);
    expect(stats.paragraphs).toBe(2);
    expect(stats.lines).toBe(3);
  });

  it('strips only whitespace when counting characters without spaces', () => {
    const stats = countWords('a b\tc\nd');
    expect(stats.characters).toBe(7);
    expect(stats.characters_no_spaces).toBe(4);
  });

  it('derives reading and speaking time from the given words per minute', () => {
    const stats = countWords('one two three four', {
      words_per_minute: 4,
      words_per_minute_speaking: 2,
    });
    expect(stats.reading_minutes).toBeCloseTo(1);
    expect(stats.speaking_minutes).toBeCloseTo(2);
  });
});

describe('formatDuration', () => {
  it('formats zero or negative durations as 0 sec', () => {
    expect(formatDuration(0)).toBe('0 sec');
    expect(formatDuration(-1)).toBe('0 sec');
  });

  it('formats sub minute durations in seconds only', () => {
    expect(formatDuration(0.5)).toBe('30 sec');
  });

  it('formats whole minute durations without a seconds part', () => {
    expect(formatDuration(2)).toBe('2 min');
  });

  it('formats mixed durations with both parts', () => {
    expect(formatDuration(1.5)).toBe('1 min 30 sec');
  });
});

describe('buildWordCountReport', () => {
  it('includes every stat by label', () => {
    const report = buildWordCountReport(countWords('one two three.'));
    expect(report).toContain('Words: 3');
    expect(report).toContain('Sentences: 1');
    expect(report).toContain('Reading time:');
    expect(report).toContain('Speaking time:');
  });
});
