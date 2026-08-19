import { describe, expect, it } from 'vitest';
import { generateSlug } from '@/lib/text/slug_generator';

describe('generateSlug', () => {
  it('lowercases and hyphenates a plain title', () => {
    expect(generateSlug('How to Create a Website')).toBe('how-to-create-a-website');
  });

  it('collapses punctuation and extra spaces into a single hyphen', () => {
    expect(generateSlug('Step-by-Step Guide (2024)!!')).toBe('step-by-step-guide-2024');
  });

  it('trims leading and trailing hyphens', () => {
    expect(generateSlug('  --Hello World--  ')).toBe('hello-world');
  });

  it('strips diacritics instead of dropping the letter entirely', () => {
    expect(generateSlug('Café résumé')).toBe('cafe-resume');
  });

  it('returns an empty slug for empty or purely symbolic input', () => {
    expect(generateSlug('')).toBe('');
    expect(generateSlug('!!!')).toBe('');
  });

  it('keeps the case when lowercase is turned off', () => {
    expect(generateSlug('Hello World', { lowercase: false })).toBe('Hello-World');
  });
});
