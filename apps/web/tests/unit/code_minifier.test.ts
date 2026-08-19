import { describe, expect, it } from 'vitest';
import { DEFAULT_CODE_MINIFY_OPTIONS, minifyCode } from '@/features/developer/code_minifier/minify';

describe('minifyCode: JavaScript via terser', () => {
  it('minifies and reports minifyMode "full"', async () => {
    const result = await minifyCode(
      'function add(a, b) {\n  return a + b;\n}\n',
      'javascript',
      DEFAULT_CODE_MINIFY_OPTIONS,
    );
    expect(result.minifyMode).toBe('full');
    expect(result.output.length).toBeLessThan('function add(a, b) {\n  return a + b;\n}\n'.length);
    expect(result.minifiedBytes).toBeLessThan(result.originalBytes);
  });

  it('reports minifyMode "failed" and keeps the original input on invalid syntax', async () => {
    const source = 'function add(a, b) {\n  return a +\n';
    const result = await minifyCode(source, 'javascript', DEFAULT_CODE_MINIFY_OPTIONS);
    expect(result.minifyMode).toBe('failed');
    expect(result.output).toBe(source);
  });
});

describe('minifyCode: CSS via csso', () => {
  it('minifies and reports minifyMode "full"', async () => {
    const result = await minifyCode(
      '.a {\n  color: red;\n  margin: 0px;\n}\n',
      'css',
      DEFAULT_CODE_MINIFY_OPTIONS,
    );
    expect(result.minifyMode).toBe('full');
    expect(result.output).not.toContain('\n');
  });
});

describe('minifyCode: HTML via html-minifier-terser', () => {
  it('minifies and reports minifyMode "full"', async () => {
    const result = await minifyCode(
      '<div>\n  <p>  Hello  </p>\n</div>\n',
      'html',
      DEFAULT_CODE_MINIFY_OPTIONS,
    );
    expect(result.minifyMode).toBe('full');
    expect(result.output.length).toBeLessThan('<div>\n  <p>  Hello  </p>\n</div>\n'.length);
  });
});

describe('minifyCode: JSON', () => {
  it('strips whitespace and reports minifyMode "full"', async () => {
    const result = await minifyCode('{\n  "a": 1,\n  "b": [1, 2, 3]\n}', 'json', DEFAULT_CODE_MINIFY_OPTIONS);
    expect(result.minifyMode).toBe('full');
    expect(result.output).toBe('{"a":1,"b":[1,2,3]}');
  });

  it('reports minifyMode "failed" and keeps the original input on invalid JSON', async () => {
    const source = '{ invalid';
    const result = await minifyCode(source, 'json', DEFAULT_CODE_MINIFY_OPTIONS);
    expect(result.minifyMode).toBe('failed');
    expect(result.output).toBe(source);
  });
});
