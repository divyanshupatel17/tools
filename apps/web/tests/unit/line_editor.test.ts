import { describe, expect, it } from 'vitest';
import { editLines } from '@/lib/text/line_editor';

describe('editLines', () => {
  it('leaves text unchanged with no options set', () => {
    expect(editLines('a\nb\nc', {})).toBe('a\nb\nc');
  });

  it('adds a prefix to every line', () => {
    expect(editLines('a\nb', { add_prefix: true, prefix: '> ' })).toBe('> a\n> b');
  });

  it('adds a suffix to every line', () => {
    expect(editLines('a\nb', { add_suffix: true, suffix: ';' })).toBe('a;\nb;');
  });

  it('adds plain line numbers starting from 1 by default', () => {
    expect(editLines('a\nb\nc', { add_line_numbers: true })).toBe('1 a\n2 b\n3 c');
  });

  it('starts numbering from a custom value', () => {
    expect(editLines('a\nb', { add_line_numbers: true, start_from: 5 })).toBe('5 a\n6 b');
  });

  it('formats line numbers with a dot', () => {
    expect(editLines('a\nb', { add_line_numbers: true, number_format: 'dot' })).toBe(
      '1. a\n2. b',
    );
  });

  it('formats line numbers with a parenthesis', () => {
    expect(editLines('a\nb', { add_line_numbers: true, number_format: 'paren' })).toBe(
      '1) a\n2) b',
    );
  });

  it('pads line numbers to a common width', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n');
    const result = editLines(lines, { add_line_numbers: true, number_format: 'padded' });
    expect(result.split('\n')[0]).toBe('01 line0');
    expect(result.split('\n')[9]).toBe('10 line9');
  });

  it('keeps only lines that contain the search text', () => {
    expect(editLines('apple\nbanana\ngrape', { filter_mode: 'keep_contains', filter_text: 'an' })).toBe(
      'banana',
    );
  });

  it('removes lines that contain the search text', () => {
    expect(
      editLines('apple\nbanana\ngrape', { filter_mode: 'remove_contains', filter_text: 'an' }),
    ).toBe('apple\ngrape');
  });

  it('keeps only lines that match a regular expression', () => {
    expect(editLines('a1\nb2\ncc', { filter_mode: 'keep_regex', filter_regex: '\\d' })).toBe(
      'a1\nb2',
    );
  });

  it('throws a friendly error for an invalid regular expression', () => {
    expect(() => editLines('a', { filter_mode: 'keep_regex', filter_regex: '(' })).toThrow();
  });

  it('numbers only the lines that survive filtering, not their original position', () => {
    expect(
      editLines('keep1\ndrop\nkeep2', {
        filter_mode: 'remove_contains',
        filter_text: 'drop',
        add_line_numbers: true,
      }),
    ).toBe('1 keep1\n2 keep2');
  });

  it('applies prefix, suffix and numbering together in one pass', () => {
    expect(
      editLines('a\nb', {
        add_prefix: true,
        prefix: '[',
        add_suffix: true,
        suffix: ']',
        add_line_numbers: true,
      }),
    ).toBe('1 [a]\n2 [b]');
  });
});
