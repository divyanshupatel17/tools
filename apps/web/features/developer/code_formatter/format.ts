import { languageById, type LanguageDef } from './languages';

export type QuoteStyle = 'none' | 'single' | 'double';

export interface CodeFormatOptions {
  autoFormat: boolean;
  removeExtraSpaces: boolean;
  sortImports: boolean;
  convertQuotes: QuoteStyle;
  wrapLines: boolean;
  wrapWidth: number;
  finalNewline: boolean;
}

export const DEFAULT_CODE_FORMAT_OPTIONS: CodeFormatOptions = {
  autoFormat: true,
  removeExtraSpaces: false,
  sortImports: false,
  convertQuotes: 'none',
  wrapLines: false,
  wrapWidth: 80,
  finalNewline: true,
};

export interface CodeFormatResult {
  output: string;
  /** 'full' when an AST aware formatter (prettier / sql-formatter / a WASM formatter / the XML
   * parser) ran, 'best_effort' when the language has no real formatter here so only whitespace
   * cleanup ran, 'failed' when a real formatter exists but could not parse this input, 'none'
   * when auto format was off. */
  formatMode: 'full' | 'best_effort' | 'failed' | 'none';
  language: LanguageDef;
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function trimTrailingWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

function ensureFinalNewline(text: string): string {
  const trimmed = text.replace(/\n+$/, '');
  return trimmed === '' ? '' : `${trimmed}\n`;
}

/** Best effort reindent for brace/bracket languages: tracks nesting depth line by line and
 * rewrites each line's leading whitespace to match, ignoring braces inside strings or line
 * comments is out of scope — this is a heuristic, not a parser. */
function reindentByBraceDepth(text: string, indentSize = 2): string {
  const lines = text.split('\n');
  let depth = 0;
  const result: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') {
      result.push('');
      continue;
    }
    const leadingClosers = line.match(/^[)}\]]+/);
    let lineDepth = depth;
    if (leadingClosers) lineDepth = Math.max(0, depth - leadingClosers[0].length);
    result.push(' '.repeat(Math.max(0, lineDepth) * indentSize) + line);

    let running = depth;
    for (const char of line) {
      if (char === '{' || char === '(' || char === '[') running++;
      else if (char === '}' || char === ')' || char === ']') running = Math.max(0, running - 1);
    }
    depth = running;
  }
  return result.join('\n');
}

const BRACE_LANGUAGES = new Set([
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'php',
  'kotlin',
  'swift',
]);

/** A contiguous run of import/require lines at the top of the file (after leading blank and
 * comment lines) gets sorted alphabetically. If the top of the file is not import statements,
 * nothing changes — never a fake success. */
function sortImportBlock(text: string, languageId: string): string {
  const lines = text.split('\n');
  let start = 0;
  while (start < lines.length) {
    const trimmed = (lines[start] ?? '').trim();
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
      start++;
    } else {
      break;
    }
  }

  const importPattern =
    languageId === 'python'
      ? /^\s*(import\s+\S+|from\s+\S+\s+import\s+.+)$/
      : /^\s*(import\s+.+from\s+['"].+['"];?|import\s+['"].+['"];?|(?:const|let|var)\s+.+=\s*require\(.+\);?)$/;

  let end = start;
  while (end < lines.length && importPattern.test(lines[end] ?? '')) end++;

  if (end - start < 2) return text;

  const block = lines.slice(start, end);
  const sorted = [...block].sort((a, b) => a.localeCompare(b));
  return [...lines.slice(0, start), ...sorted, ...lines.slice(end)].join('\n');
}

/** Careful, line scoped quote swap for languages prettier does not cover — only rewrites
 * simple, unescaped quoted literals so it never mangles a string containing the other quote
 * character or an escape sequence. */
function convertQuotesRegex(text: string, style: QuoteStyle): string {
  if (style === 'none') return text;
  if (style === 'double') {
    return text.replace(/'([^'\\\n]*)'/g, (match, inner: string) =>
      inner.includes('"') ? match : `"${inner}"`,
    );
  }
  return text.replace(/"([^"\\\n]*)"/g, (match, inner: string) =>
    inner.includes("'") ? match : `'${inner}'`,
  );
}

function wrapLongLines(text: string, width: number): string {
  return text
    .split('\n')
    .map((line) => {
      if (line.length <= width) return line;
      const words = line.split(' ');
      const wrapped: string[] = [];
      let current = '';
      for (const word of words) {
        const next = current === '' ? word : `${current} ${word}`;
        if (next.length > width && current !== '') {
          wrapped.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current !== '') wrapped.push(current);
      return wrapped.join('\n');
    })
    .join('\n');
}

async function formatWithPrettier(
  source: string,
  language: LanguageDef,
  options: CodeFormatOptions,
): Promise<string> {
  const prettier = await import('prettier/standalone');
  const parser = language.prettierParser!;
  const pluginModules: unknown[] = [];

  if (parser === 'babel' || parser === 'json' || parser === 'json5') {
    const [babel, estree] = await Promise.all([
      import('prettier/plugins/babel'),
      import('prettier/plugins/estree'),
    ]);
    pluginModules.push(babel.default ?? babel, estree.default ?? estree);
  } else if (parser === 'typescript') {
    const [typescript, estree] = await Promise.all([
      import('prettier/plugins/typescript'),
      import('prettier/plugins/estree'),
    ]);
    pluginModules.push(typescript.default ?? typescript, estree.default ?? estree);
  } else if (parser === 'css' || parser === 'scss' || parser === 'less') {
    const postcss = await import('prettier/plugins/postcss');
    pluginModules.push(postcss.default ?? postcss);
  } else if (parser === 'html' || parser === 'vue') {
    const html = await import('prettier/plugins/html');
    pluginModules.push(html.default ?? html);
  } else if (parser === 'markdown') {
    const markdown = await import('prettier/plugins/markdown');
    pluginModules.push(markdown.default ?? markdown);
  } else if (parser === 'yaml') {
    const yaml = await import('prettier/plugins/yaml');
    pluginModules.push(yaml.default ?? yaml);
  } else if (parser === 'graphql') {
    const graphql = await import('prettier/plugins/graphql');
    pluginModules.push(graphql.default ?? graphql);
  }

  const supportsQuoteOption = [
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'css',
    'scss',
    'less',
    'html',
    'vue',
  ].includes(language.id);

  const formatted = await prettier.format(source, {
    parser,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: pluginModules as any,
    printWidth: options.wrapLines ? options.wrapWidth : 80,
    singleQuote: supportsQuoteOption ? options.convertQuotes === 'single' : undefined,
  });

  return formatted;
}

async function formatWithSql(source: string): Promise<string> {
  const { format } = await import('sql-formatter');
  return format(source, { language: 'sql' });
}

/** `#include <...>` is a preprocessor directive that, per the C preprocessor grammar, extends
 * to the end of its physical source line — clang-format correctly refuses to break anything
 * glued onto that same line without a real newline, since it cannot know where the directive
 * was meant to end. Competitive-programming style one-liners routinely paste `#include<...>`
 * immediately followed by more code with no newline at all, which otherwise makes clang-format
 * silently leave the entire file untouched. Inserting the newline the directive already implies
 * is meaning preserving (it is exactly where the C grammar requires one), not a rewrite. */
function ensureIncludeNewlines(source: string): string {
  return source.replace(/(#\s*include\s*(?:<[^>\n]+>|"[^"\n]+"))(?!\s*\r?\n)/g, '$1\n');
}

/** clang-format (via @wasm-fmt/clang-format, a real clang-format build compiled to WASM) backs
 * Java, C, C++ and C# — the same underlying formatter clang-format CLI users already know.
 * Loaded through the `/web` entry point, which requires calling its default `init()` once before
 * `format()` is usable; the module caches its own WASM instance after the first init. */
async function formatWithClang(source: string, language: LanguageDef, options: CodeFormatOptions): Promise<string> {
  const clang = await import('@wasm-fmt/clang-format/web');
  await clang.default();
  const columnLimit = options.wrapLines ? options.wrapWidth : 100;
  const style = JSON.stringify({
    BasedOnStyle: language.id === 'csharp' ? 'Microsoft' : 'Google',
    IndentWidth: 2,
    ColumnLimit: columnLimit,
  });
  const input =
    language.id === 'c' || language.id === 'cpp' ? ensureIncludeNewlines(source) : source;
  return clang.format(input, language.clangFileName ?? `main.${language.extension}`, style);
}

/** ruff's formatter (via @wasm-fmt/ruff_fmt, ruff compiled to WASM) — the same formatter behind
 * the `ruff format` CLI, a drop in Black replacement. */
async function formatWithRuff(source: string, options: CodeFormatOptions): Promise<string> {
  const ruff = await import('@wasm-fmt/ruff_fmt/web');
  await ruff.default();
  return ruff.format(source, 'main.py', {
    indent_style: 'space',
    indent_width: 4,
    line_width: options.wrapLines ? options.wrapWidth : 88,
    quote_style: options.convertQuotes === 'single' ? 'single' : 'double',
    magic_trailing_comma: 'respect',
  });
}

/** gofmt compiled to WASM (@wasm-fmt/gofmt) — canonical Go formatting. gofmt has no configurable
 * width or quote style (Go quotes are not interchangeable: single quotes are rune literals, not
 * an alternate string style), so none of the generic quote/wrap options apply here. */
async function formatWithGofmt(source: string): Promise<string> {
  const gofmt = await import('@wasm-fmt/gofmt/web');
  await gofmt.default();
  return gofmt.format(source);
}

/** shfmt compiled to WASM (@wasm-fmt/shfmt) — canonical POSIX/bash shell formatting. */
async function formatWithShfmt(source: string): Promise<string> {
  const shfmt = await import('@wasm-fmt/shfmt/web');
  await shfmt.default();
  return shfmt.format(source, 'script.sh', { indent: 2, spaceRedirects: false, simplify: false });
}

/** mago's PHP formatter compiled to WASM (@wasm-fmt/mago_fmt). */
async function formatWithMago(source: string, options: CodeFormatOptions): Promise<string> {
  const mago = await import('@wasm-fmt/mago_fmt/web');
  await mago.default();
  return mago.format(source, 'main.php', {
    'use-tabs': false,
    'tab-width': 2,
    'print-width': options.wrapLines ? options.wrapWidth : 120,
  });
}

async function formatWithWasm(source: string, language: LanguageDef, options: CodeFormatOptions): Promise<string> {
  switch (language.wasmFormatter) {
    case 'clang':
      return formatWithClang(source, language, options);
    case 'ruff':
      return formatWithRuff(source, options);
    case 'gofmt':
      return formatWithGofmt(source);
    case 'shfmt':
      return formatWithShfmt(source);
    case 'mago':
      return formatWithMago(source, options);
    default:
      throw new Error(`No WASM formatter wired up for ${language.id}`);
  }
}

/** xml-formatter — a real XML parser/serializer (not a heuristic), browser safe, respects
 * xml:space. Genuinely reparses structure rather than just reindenting by eye. */
async function formatWithXml(source: string): Promise<string> {
  const xmlFormat = (await import('xml-formatter')).default;
  return xmlFormat(source, { indentation: '  ', collapseContent: true, lineSeparator: '\n' });
}

/** Languages excluded from the generic post format convertQuotesRegex step: either a real
 * formatter above already handled quote style correctly (python), or a naive swap would change
 * program meaning rather than just style (C family char literals, Go rune literals, bash
 * expansion rules). */
const NATIVE_OR_UNSAFE_QUOTE_CONVERSION_LANGUAGES = new Set([
  'python',
  'go',
  'c',
  'cpp',
  'java',
  'csharp',
  'shell',
]);

/** Whitespace level cleanup applied to every language regardless of engine, and the entire
 * formatting story for languages with no AST formatter behind them. Never claims to have
 * fully reformatted code it only tidied. */
function bestEffortCleanup(source: string, languageId: string, options: CodeFormatOptions): string {
  let text = normalizeLineEndings(source);
  text = trimTrailingWhitespace(text);
  text = collapseBlankLines(text);
  if (options.autoFormat && BRACE_LANGUAGES.has(languageId)) {
    text = reindentByBraceDepth(text);
  }
  return text;
}

/**
 * Formats `source` for `languageId` per `options`. Full AST formatting runs for languages
 * prettier or sql-formatter cover; every other language gets an honestly labelled best effort
 * whitespace cleanup instead. Never throws — a formatter failure falls back to the cleaned up
 * input with `error` set, so the UI can show it was not fully formatted rather than losing work.
 */
export async function formatCode(
  source: string,
  languageId: string,
  options: CodeFormatOptions = DEFAULT_CODE_FORMAT_OPTIONS,
): Promise<CodeFormatResult> {
  const language = languageById(languageId);

  if (!options.autoFormat) {
    let output = source;
    if (options.removeExtraSpaces) {
      output = collapseBlankLines(trimTrailingWhitespace(output));
    }
    if (options.sortImports && language.supportsImportSort) {
      output = sortImportBlock(output, language.id);
    }
    if (options.convertQuotes !== 'none') {
      output = convertQuotesRegex(output, options.convertQuotes);
    }
    if (options.finalNewline) output = ensureFinalNewline(output);
    return { output, formatMode: 'none', language };
  }

  let output = source;
  let formatMode: CodeFormatResult['formatMode'] = 'best_effort';

  try {
    if (language.engine === 'prettier') {
      output = await formatWithPrettier(source, language, options);
      formatMode = 'full';
    } else if (language.engine === 'sql') {
      output = await formatWithSql(source);
      formatMode = 'full';
    } else if (language.engine === 'wasm') {
      output = await formatWithWasm(source, language, options);
      formatMode = 'full';
    } else if (language.engine === 'xml') {
      output = await formatWithXml(source);
      formatMode = 'full';
    } else {
      output = bestEffortCleanup(source, language.id, options);
      formatMode = 'best_effort';
    }
  } catch {
    // A real formatter exists for this language but could not parse the input (a syntax
    // error while the user is mid edit, most often) — fall back to whitespace cleanup rather
    // than losing their work, and let the UI label this distinctly from "no formatter at all".
    output = bestEffortCleanup(source, language.id, options);
    formatMode = 'failed';
  }

  if (options.removeExtraSpaces) {
    output = collapseBlankLines(trimTrailingWhitespace(output));
  }
  if (options.sortImports && language.supportsImportSort) {
    output = sortImportBlock(output, language.id);
  }
  // A blind, line scoped quote swap is only safe when the target quote characters are truly
  // interchangeable string styles. Skip it for languages where it would silently change meaning
  // (C family char literals, Go's rune literals, bash's expansion rules) or where the real
  // formatter above already applied quote style correctly (Python, via ruff's quote_style).
  if (
    options.convertQuotes !== 'none' &&
    language.engine !== 'prettier' &&
    !NATIVE_OR_UNSAFE_QUOTE_CONVERSION_LANGUAGES.has(language.id)
  ) {
    output = convertQuotesRegex(output, options.convertQuotes);
  }
  // Naive word wrap is only applied where nothing already formatted the code correctly: a real
  // formatter's own width option (threaded through above) or its idiomatic fixed style (gofmt,
  // shfmt) must never be undone by blindly breaking lines on spaces afterwards.
  if (options.wrapLines && (language.engine === 'sql' || language.engine === 'best_effort')) {
    output = wrapLongLines(output, options.wrapWidth);
  }
  if (options.finalNewline) output = ensureFinalNewline(output);

  return { output, formatMode, language };
}

export {
  normalizeLineEndings,
  trimTrailingWhitespace,
  collapseBlankLines,
  ensureFinalNewline,
  reindentByBraceDepth,
  sortImportBlock,
  convertQuotesRegex,
};
