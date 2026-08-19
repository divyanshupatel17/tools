import { describe, expect, it } from 'vitest';
import {
  fixIndentation,
  formatMarkdown,
  normalizeLineEndings,
  removeTrailingSpaces,
  tidyMarkdown,
} from '@/lib/text/markdown/format';

describe('normalizeLineEndings', () => {
  it('converts CRLF and lone CR to LF', () => {
    expect(normalizeLineEndings('a\r\nb\rc')).toBe('a\nb\nc');
  });
});

describe('removeTrailingSpaces', () => {
  it('strips trailing spaces and tabs from every line', () => {
    expect(removeTrailingSpaces('a  \nb\t\nc')).toBe('a\nb\nc');
  });

  it('leaves leading whitespace alone', () => {
    expect(removeTrailingSpaces('  indented  ')).toBe('  indented');
  });
});

describe('fixIndentation', () => {
  it('converts leading tabs to two spaces each', () => {
    expect(fixIndentation('\t\tnested')).toBe('    nested');
  });

  it('leaves a tab inside the line content alone', () => {
    expect(fixIndentation('a\tb')).toBe('a\tb');
  });
});

describe('tidyMarkdown', () => {
  it('adds a space after a heading marker', () => {
    expect(tidyMarkdown('#Title')).toBe('# Title\n');
  });

  it('normalizes extra spaces after a list marker', () => {
    expect(tidyMarkdown('-   item')).toBe('- item\n');
  });

  it('normalizes spacing after an ordered list marker', () => {
    expect(tidyMarkdown('1.   item')).toBe('1. item\n');
  });

  it('collapses three or more blank lines to one', () => {
    expect(tidyMarkdown('a\n\n\n\nb')).toBe('a\n\nb\n');
  });

  it('ensures exactly one trailing newline', () => {
    expect(tidyMarkdown('a\n\n\n')).toBe('a\n');
  });

  it('leaves empty input empty', () => {
    expect(tidyMarkdown('')).toBe('');
  });
});

describe('formatMarkdown', () => {
  const ALL_OFF = {
    auto_format: false,
    normalize_line_endings: false,
    remove_trailing_spaces: false,
    fix_indentation: false,
  };

  it('applies nothing when every option is off', () => {
    expect(formatMarkdown('#Title  \r\n', ALL_OFF)).toBe('#Title  \r\n');
  });

  it('applies only the requested passes', () => {
    const result = formatMarkdown('a  \nb', { ...ALL_OFF, remove_trailing_spaces: true });
    expect(result).toBe('a\nb');
  });

  it('runs auto format last, over whatever earlier passes already changed', () => {
    const result = formatMarkdown('#Title\r\n\r\n\r\n\r\nbody', {
      ...ALL_OFF,
      normalize_line_endings: true,
      auto_format: true,
    });
    expect(result).toBe('# Title\n\nbody\n');
  });
});
