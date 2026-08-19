import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CODE_FORMAT_OPTIONS, formatCode } from '@/features/developer/code_formatter/format';

const require = createRequire(import.meta.url);

// The WASM formatters' `/web` entry self-fetches its .wasm via `new URL(..., import.meta.url)`
// when called with no argument, which Node's fetch cannot do for file: URLs (a Node test
// runner limitation, not a browser one — the actual app fetches over http(s) and works fine).
// Pre-warming each module here with its bytes read from disk lets format.ts's own no-arg
// `default()` call inside formatCode short circuit against the already-initialized instance,
// since dynamic imports of the same specifier resolve to one shared module in the module cache.
async function warmWasmFormatter(webEntry: string, wasmSubpath: string) {
  const mod = (await import(webEntry)) as { initSync: (bytes: Buffer) => unknown };
  const bytes = readFileSync(require.resolve(wasmSubpath));
  mod.initSync(bytes);
}

beforeAll(async () => {
  await Promise.all([
    warmWasmFormatter('@wasm-fmt/clang-format/web', '@wasm-fmt/clang-format/wasm'),
    warmWasmFormatter('@wasm-fmt/ruff_fmt/web', '@wasm-fmt/ruff_fmt/wasm'),
    warmWasmFormatter('@wasm-fmt/gofmt/web', '@wasm-fmt/gofmt/wasm'),
    warmWasmFormatter('@wasm-fmt/shfmt/web', '@wasm-fmt/shfmt/wasm'),
    warmWasmFormatter('@wasm-fmt/mago_fmt/web', '@wasm-fmt/mago_fmt/wasm'),
  ]);
});

describe('formatCode: JavaScript via prettier', () => {
  it('runs full AST formatting and reports formatMode "full"', async () => {
    const result = await formatCode(
      'const x={a:1,b:2}\nfunction f( a,b ){return a+b}\n',
      'javascript',
      DEFAULT_CODE_FORMAT_OPTIONS,
    );
    expect(result.formatMode).toBe('full');
    expect(result.output).toContain('const x = { a: 1, b: 2 };');
    expect(result.output).toContain('function f(a, b) {');
  });

  it('reports formatMode "failed" when the input cannot be parsed as JavaScript', async () => {
    const result = await formatCode(
      '{"user":{"name":"Divi","age":22}}',
      'javascript',
      DEFAULT_CODE_FORMAT_OPTIONS,
    );
    expect(result.formatMode).toBe('failed');
    expect(result.output).toContain('"user"');
  });

  it('applies singleQuote when convertQuotes is single', async () => {
    const result = await formatCode('const s = "hello";\n', 'javascript', {
      ...DEFAULT_CODE_FORMAT_OPTIONS,
      convertQuotes: 'single',
    });
    expect(result.output).toContain("'hello'");
  });
});

describe('formatCode: JSON via prettier', () => {
  it('pretty prints JSON and reports formatMode "full"', async () => {
    const result = await formatCode('{"a":1,"b":[1,2,3]}', 'json', DEFAULT_CODE_FORMAT_OPTIONS);
    expect(result.formatMode).toBe('full');
    expect(result.output).toBe('{ "a": 1, "b": [1, 2, 3] }\n');
  });
});

describe('formatCode: Python via ruff (WASM)', () => {
  it('runs full AST formatting and reports formatMode "full"', async () => {
    const messy = 'def f(a,b):\n  return a+b\n\nclass X(object):\n  def g(self,x,y=42):\n      return y\n';
    const result = await formatCode(messy, 'python', DEFAULT_CODE_FORMAT_OPTIONS);
    expect(result.formatMode).toBe('full');
    expect(result.output).toContain('def f(a, b):');
    expect(result.output).toContain('    return a + b');
    expect(result.output).toContain('class X(object):');
  });

  it('reports formatMode "failed" and falls back to whitespace cleanup on invalid syntax', async () => {
    const result = await formatCode('def f(:\n  return\n', 'python', DEFAULT_CODE_FORMAT_OPTIONS);
    expect(result.formatMode).toBe('failed');
    expect(result.output).toContain('def f(:');
  });
});

describe('formatCode: C++ via clang-format (WASM)', () => {
  it('runs full AST formatting and reports formatMode "full"', async () => {
    const messy = '#include<bits/stdc++.h>\nusing namespace std;\nint main(){int x=5;if(x>0){cout<<x;}return 0;}\n';
    const result = await formatCode(messy, 'cpp', DEFAULT_CODE_FORMAT_OPTIONS);
    expect(result.formatMode).toBe('full');
    expect(result.output).toContain('int main() {');
    expect(result.output).toContain('  int x = 5;');
    expect(result.output).toContain('  if (x > 0) {');
  });
});

describe('formatCode: C++ one liner with no newlines at all (WASM)', () => {
  it('still reformats fully — a bare #include glued to the rest of the file must not silently no-op', async () => {
    const oneLiner =
      '#include<bits/stdc++.h>using namespace std;int main(){int x=5;if(x>0){cout<<x;}return 0;}';
    const result = await formatCode(oneLiner, 'cpp', DEFAULT_CODE_FORMAT_OPTIONS);
    expect(result.formatMode).toBe('full');
    expect(result.output).toContain('#include <bits/stdc++.h>\n');
    expect(result.output).toContain('using namespace std;\n');
    expect(result.output).toContain('int main() {');
    expect(result.output).toContain('  int x = 5;');
  });
});

describe('formatCode: Java via clang-format (WASM)', () => {
  it('runs full AST formatting and reports formatMode "full"', async () => {
    const messy = 'public class Main{public static void main(String[] args){System.out.println("hi");}}\n';
    const result = await formatCode(messy, 'java', DEFAULT_CODE_FORMAT_OPTIONS);
    expect(result.formatMode).toBe('full');
    expect(result.output).toContain('public class Main {');
    expect(result.output).toContain('System.out.println("hi");');
  });
});

describe('formatCode: Go via gofmt (WASM)', () => {
  it('runs full AST formatting, reports formatMode "full" and never rewrites rune quotes', async () => {
    const messy = "package main\nimport \"fmt\"\nfunc main(){c:='a'\nfmt.Println(c)\n}\n";
    const result = await formatCode(messy, 'go', {
      ...DEFAULT_CODE_FORMAT_OPTIONS,
      convertQuotes: 'double',
    });
    expect(result.formatMode).toBe('full');
    expect(result.output).toContain('func main() {');
    // Go rune literal quotes must never be converted to double quotes — that would change the
    // program from a rune literal to a string literal and stop compiling.
    expect(result.output).toContain("c := 'a'");
  });
});

describe('formatCode: PHP via mago (WASM)', () => {
  it('runs full AST formatting and reports formatMode "full"', async () => {
    const messy = '<?php\nfunction hello($name){\necho "Hello, ".$name;\n}\n';
    const result = await formatCode(messy, 'php', DEFAULT_CODE_FORMAT_OPTIONS);
    expect(result.formatMode).toBe('full');
    expect(result.output).toContain('function hello($name)');
    expect(result.output).toContain('{');
  });
});

describe('formatCode: Shell via shfmt (WASM)', () => {
  it('runs full AST formatting and reports formatMode "full"', async () => {
    const messy = '#!/bin/bash\nif [ $x -gt 0 ]; then\necho hi\nfi\n';
    const result = await formatCode(messy, 'shell', DEFAULT_CODE_FORMAT_OPTIONS);
    expect(result.formatMode).toBe('full');
    expect(result.output).toContain('if [ $x -gt 0 ]; then');
    expect(result.output).toContain('  echo hi');
  });
});

describe('formatCode: XML via xml-formatter', () => {
  it('runs full structural reindenting and reports formatMode "full"', async () => {
    const messy = '<root><item id="1"><name>Test</name><value>42</value></item></root>';
    const result = await formatCode(messy, 'xml', DEFAULT_CODE_FORMAT_OPTIONS);
    expect(result.formatMode).toBe('full');
    expect(result.output).toContain('<root>\n  <item id="1">\n    <name>Test</name>');
  });

  it('reports formatMode "failed" and falls back to whitespace cleanup on unparsable input', async () => {
    const result = await formatCode('this is not xml at all { }', 'xml', DEFAULT_CODE_FORMAT_OPTIONS);
    expect(result.formatMode).toBe('failed');
    expect(result.output).toContain('this is not xml at all { }');
  });
});

describe('formatCode: Rust best effort fallback (no browser safe formatter available)', () => {
  it('cleans up whitespace but never claims full AST formatting', async () => {
    const messy = 'fn f() {   \n    return 1;\n\n\n\n    \n}\n';
    const result = await formatCode(messy, 'rust', DEFAULT_CODE_FORMAT_OPTIONS);

    expect(result.formatMode).toBe('best_effort');
    // Trailing whitespace trimmed on every line.
    expect(result.output).not.toMatch(/[ \t]+\n/);
    // Runs of 3+ blank lines collapsed to a single blank line.
    expect(result.output).not.toMatch(/\n{3,}/);
    // Exactly one trailing newline.
    expect(result.output.endsWith('\n')).toBe(true);
    expect(result.output.endsWith('\n\n')).toBe(false);
  });

  it('does not touch code when auto format is off, only applies the explicit toggles', async () => {
    const source = 'x=1   \n';
    const result = await formatCode(source, 'rust', {
      ...DEFAULT_CODE_FORMAT_OPTIONS,
      autoFormat: false,
      removeExtraSpaces: false,
      finalNewline: false,
    });
    expect(result.formatMode).toBe('none');
    expect(result.output).toBe(source);
  });
});
