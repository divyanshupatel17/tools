import { parseInlineMarkdown } from './markdown_inline';
import type { DocBlock, InlineSpan } from './pdf_typeset';

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const TABLE_ROW = /^\|(.+)\|$/;
const TABLE_DIVIDER = /^\|?[\s:|-]+\|?$/;
const FENCE = /^```/;
const HR = /^(?:-{3,}|\*{3,}|_{3,})$/;
const BLOCKQUOTE = /^>\s?(.*)$/;

function splitTableRow(line: string): string[] {
  const match = TABLE_ROW.exec(line.trim());
  const inner = match ? match[1]! : line.trim();
  return inner.split('|').map((cell) => cell.trim());
}

/** A forgiving GFM-subset parser (headings, lists, fenced code, pipe tables, blockquotes, hr,
 * paragraphs). Images are not resolved; the markup is left as literal text. */
export function parseMarkdownToBlocks(source: string): DocBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: DocBlock[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    if (FENCE.test(line.trim())) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index]!.trim())) {
        codeLines.push(lines[index]!);
        index += 1;
      }
      index += 1;
      blocks.push({ type: 'code', lines: codeLines });
      continue;
    }

    if (HR.test(line.trim())) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    const blockquote = BLOCKQUOTE.exec(line);
    if (blockquote) {
      const quoteLines = [parseInlineMarkdown(blockquote[1]!.trim())];
      index += 1;
      while (index < lines.length) {
        const next = BLOCKQUOTE.exec(lines[index]!);
        if (!next) break;
        quoteLines.push(parseInlineMarkdown(next[1]!.trim()));
        index += 1;
      }
      blocks.push({ type: 'blockquote', lines: quoteLines });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6,
        spans: parseInlineMarkdown(heading[2]!.trim()),
      });
      index += 1;
      continue;
    }

    if (
      TABLE_ROW.test(line.trim()) &&
      index + 1 < lines.length &&
      TABLE_DIVIDER.test(lines[index + 1]!.trim())
    ) {
      const rows: InlineSpan[][][] = [splitTableRow(line).map((cell) => parseInlineMarkdown(cell))];
      index += 2;
      while (index < lines.length && TABLE_ROW.test(lines[index]!.trim())) {
        rows.push(splitTableRow(lines[index]!).map((cell) => parseInlineMarkdown(cell)));
        index += 1;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items = [parseInlineMarkdown((bullet ?? numbered)![1]!.trim())];
      index += 1;
      while (index < lines.length) {
        const next = lines[index]!;
        const nextBullet = BULLET.exec(next);
        const nextNumbered = NUMBERED.exec(next);
        const match = ordered ? nextNumbered : nextBullet;
        if (!match) break;
        items.push(parseInlineMarkdown(match[1]!.trim()));
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index]!.trim() !== '' &&
      !HEADING.test(lines[index]!) &&
      !FENCE.test(lines[index]!.trim()) &&
      !BULLET.test(lines[index]!) &&
      !NUMBERED.test(lines[index]!) &&
      !TABLE_ROW.test(lines[index]!.trim()) &&
      !HR.test(lines[index]!.trim()) &&
      !BLOCKQUOTE.test(lines[index]!)
    ) {
      paragraphLines.push(lines[index]!.trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', spans: parseInlineMarkdown(paragraphLines.join(' ')) });
  }

  return blocks;
}
