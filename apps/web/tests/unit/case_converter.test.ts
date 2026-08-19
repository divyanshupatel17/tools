import { describe, expect, it } from 'vitest';
import { CASE_OPTIONS, convertCase } from '@/lib/text/case_converter';

describe('convertCase', () => {
  it('capitalizes the first letter of every sentence', () => {
    expect(convertCase('HELLO world. how ARE you?', 'sentence')).toBe('Hello world. How are you?');
  });

  it('capitalizes the first letter of every word for title case', () => {
    expect(convertCase('the quick brown fox', 'title')).toBe('The Quick Brown Fox');
  });

  it('uppercases and lowercases without touching structure', () => {
    expect(convertCase('Mixed Case Text', 'upper')).toBe('MIXED CASE TEXT');
    expect(convertCase('Mixed Case Text', 'lower')).toBe('mixed case text');
  });

  it('converts a phrase to camelCase', () => {
    expect(convertCase('hello world example', 'camel')).toBe('helloWorldExample');
  });

  it('converts a phrase to PascalCase', () => {
    expect(convertCase('hello world example', 'pascal')).toBe('HelloWorldExample');
  });

  it('converts a phrase to snake_case', () => {
    expect(convertCase('Hello World Example', 'snake')).toBe('hello_world_example');
  });

  it('converts a phrase to kebab-case', () => {
    expect(convertCase('Hello World Example', 'kebab')).toBe('hello-world-example');
  });

  it('converts a phrase to CONSTANT_CASE', () => {
    expect(convertCase('Hello World Example', 'constant')).toBe('HELLO_WORLD_EXAMPLE');
  });

  it('normalizes an existing camelCase identifier before re-casing it', () => {
    expect(convertCase('helloWorldExample', 'snake')).toBe('hello_world_example');
  });

  it('normalizes an existing snake_case identifier before re-casing it', () => {
    expect(convertCase('hello_world_example', 'camel')).toBe('helloWorldExample');
  });

  it('keeps one identifier per line rather than merging every line into one token', () => {
    expect(convertCase('first line\nsecond line', 'snake')).toBe('first_line\nsecond_line');
  });

  it('leaves a blank line blank for every case', () => {
    for (const option of CASE_OPTIONS) {
      expect(convertCase('one\n\ntwo', option.id)).toContain('\n\n');
    }
  });

  it('handles empty text for every case without throwing', () => {
    for (const option of CASE_OPTIONS) {
      expect(() => convertCase('', option.id)).not.toThrow();
    }
  });
});
