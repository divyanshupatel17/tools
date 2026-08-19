import type { InlineSpan } from './pdf_typeset';

/**
 * Matches the first inline marker in a string, trying longer/more specific markers before
 * shorter ones so `**bold**` is never misread as two `*italic*` spans. Nesting (e.g. bold
 * inside italic) is not resolved — the innermost/first marker found wins and its content is
 * taken literally, which keeps this a single linear scan rather than a real parser.
 */
const INLINE_MARKER = new RegExp(
  [
    '`([^`]+)`', // 1: inline code
    '\\*\\*\\*([^*]+?)\\*\\*\\*', // 2: bold+italic **_**
    '___([^_]+?)___', // 3: bold+italic ___
    '\\*\\*([^*]+?)\\*\\*', // 4: bold **
    '__([^_]+?)__', // 5: bold __
    '~~([^~]+?)~~', // 6: strikethrough
    '\\[([^\\]]+)\\]\\(([^)\\s]+)\\)', // 7,8: link text, url
    '\\*([^*\\s][^*]*?)\\*', // 9: italic *
    '(?<![\\w])_([^_\\s][^_]*?)_(?![\\w])', // 10: italic _ (word-boundary guarded so snake_case is left alone)
  ].join('|'),
);

/** Parses a single line/paragraph of Markdown into styled spans: `**bold**`, `*italic*`,
 * `~~strikethrough~~`, `` `code` ``, `[text](url)` links, and `***bold italic***`. Everything
 * else passes through as plain text. */
export function parseInlineMarkdown(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let rest = text;

  while (rest.length > 0) {
    const match = INLINE_MARKER.exec(rest);
    if (!match) {
      spans.push({ text: rest });
      break;
    }

    if (match.index > 0) spans.push({ text: rest.slice(0, match.index) });

    if (match[1] !== undefined) spans.push({ text: match[1], mono: true });
    else if (match[2] !== undefined) spans.push({ text: match[2], bold: true, italic: true });
    else if (match[3] !== undefined) spans.push({ text: match[3], bold: true, italic: true });
    else if (match[4] !== undefined) spans.push({ text: match[4], bold: true });
    else if (match[5] !== undefined) spans.push({ text: match[5], bold: true });
    else if (match[6] !== undefined) spans.push({ text: match[6], strikethrough: true });
    else if (match[7] !== undefined) spans.push({ text: match[7], link: match[8] });
    else if (match[9] !== undefined) spans.push({ text: match[9], italic: true });
    else if (match[10] !== undefined) spans.push({ text: match[10], italic: true });

    rest = rest.slice(match.index + match[0].length);
  }

  return spans.length > 0 ? spans : [{ text: '' }];
}
