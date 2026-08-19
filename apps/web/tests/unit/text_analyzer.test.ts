import { describe, expect, it } from 'vitest';
import { analyzeText, buildTextAnalysisReport } from '@/lib/text/text_analyzer';

describe('analyzeText', () => {
  it('returns all zeros for empty text', () => {
    const stats = analyzeText('');
    expect(stats.total_words).toBe(0);
    expect(stats.unique_words).toBe(0);
    expect(stats.top_words).toEqual([]);
    expect(stats.longest_word).toBe('');
    expect(stats.shortest_word).toBe('');
  });

  it('counts total and unique words, case insensitively', () => {
    const stats = analyzeText('Cat cat dog CAT');
    expect(stats.total_words).toBe(4);
    expect(stats.unique_words).toBe(2);
  });

  it('finds the longest and shortest word', () => {
    const stats = analyzeText('a bb ccc dddd');
    expect(stats.shortest_word).toBe('a');
    expect(stats.longest_word).toBe('dddd');
  });

  it('ranks the most frequent words with their density', () => {
    const stats = analyzeText('apple apple banana', { ignore_common_words: false, top_words: 5 });
    expect(stats.top_words[0]).toMatchObject({ word: 'apple', count: 2 });
    expect(stats.top_words[0]?.density).toBeCloseTo((2 / 3) * 100);
  });

  it('drops common words from the frequency table when asked to', () => {
    const stats = analyzeText('the cat and the dog', { ignore_common_words: true });
    expect(stats.top_words.map((entry) => entry.word)).toEqual(
      expect.arrayContaining(['cat', 'dog']),
    );
    expect(stats.top_words.map((entry) => entry.word)).not.toContain('the');
  });

  it('clamps the requested top word count to a sane range', () => {
    const stats = analyzeText('a b c d e f', { ignore_common_words: false, top_words: 0 });
    expect(stats.top_words.length).toBeLessThanOrEqual(1);
  });
});

describe('buildTextAnalysisReport', () => {
  it('includes every stat by label', () => {
    const report = buildTextAnalysisReport(analyzeText('apple apple banana'));
    expect(report).toContain('Total words: 3');
    expect(report).toContain('Unique words: 2');
    expect(report).toContain('Most frequent words');
  });
});
