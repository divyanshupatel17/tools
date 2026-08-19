export interface MarkdownFormatOptions {
  auto_format: boolean;
  normalize_line_endings: boolean;
  remove_trailing_spaces: boolean;
  fix_indentation: boolean;
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function removeTrailingSpaces(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n');
}

/** Leading tabs only — a tab inside a line's own content is left alone. */
export function fixIndentation(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\t+/, (tabs) => '  '.repeat(tabs.length)))
    .join('\n');
}

/**
 * A regex based tidy pass, not a full Markdown AST reprint: normalizes the handful of spacing
 * mistakes that make source hard to read (no space after `#`, two spaces after `-`, runs of
 * blank lines) without touching anything content bearing. Good enough for "tidy this up" without
 * the risk a full reformat carries of silently changing meaning (e.g. collapsing a deliberate
 * hard break).
 */
export function tidyMarkdown(text: string): string {
  let result = text;
  result = result.replace(/^(#{1,6})[ \t]*(?=\S)/gm, '$1 ');
  result = result.replace(/^(\s*)([-*+])[ \t]+(?=\S)/gm, '$1$2 ');
  result = result.replace(/^(\s*\d+[.)])[ \t]+(?=\S)/gm, '$1 ');
  result = removeTrailingSpaces(result);
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result === '' ? result : result.replace(/\n*$/, '\n');
  return result;
}

export function formatMarkdown(source: string, options: MarkdownFormatOptions): string {
  let text = source;
  if (options.normalize_line_endings) text = normalizeLineEndings(text);
  if (options.fix_indentation) text = fixIndentation(text);
  if (options.remove_trailing_spaces) text = removeTrailingSpaces(text);
  if (options.auto_format) text = tidyMarkdown(text);
  return text;
}
