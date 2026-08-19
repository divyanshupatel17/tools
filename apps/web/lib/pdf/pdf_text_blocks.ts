import type { PdfTextPage } from './pdf_text';

export type TextBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string };

const BULLET = /^[•\-*·]\s+/;
const NUMBERED = /^(\d+|[a-zA-Z])[.)]\s+/;

function bodyFontSize(pages: readonly PdfTextPage[]): number {
  const counts = new Map<number, number>();
  for (const page of pages) {
    for (const line of page.lines) {
      const size = Math.round(line.fontSize * 2) / 2;
      counts.set(size, (counts.get(size) ?? 0) + 1);
    }
  }
  let best = 12;
  let bestCount = 0;
  // Ties (common on short pages) favour the smaller size: body text is usually both the
  // most frequent size on a real page and smaller than any heading above it.
  for (const [size, count] of counts) {
    if (count > bestCount || (count === bestCount && size < best)) {
      best = size;
      bestCount = count;
    }
  }
  return best;
}

function headingLevel(fontSize: number, body: number): 1 | 2 | 3 | null {
  const ratio = fontSize / body;
  if (ratio >= 1.6) return 1;
  if (ratio >= 1.35) return 2;
  if (ratio >= 1.15) return 3;
  return null;
}

function stripListMarker(text: string): string {
  return text.replace(BULLET, '').replace(NUMBERED, '');
}

function isListItem(text: string): boolean {
  return BULLET.test(text) || NUMBERED.test(text);
}

/**
 * Turns each page's grouped lines into headings, list items and paragraphs, using font
 * size relative to the document's most common (body) size to spot headings — the same
 * heuristic a reader uses, not a document structure the PDF actually declares.
 */
export function classifyPdfTextBlocks(pages: readonly PdfTextPage[]): TextBlock[][] {
  const body = bodyFontSize(pages);

  return pages.map((page) => {
    const blocks: TextBlock[] = [];
    let paragraph: string[] = [];
    let list: string[] = [];

    function flushParagraph() {
      if (paragraph.length > 0) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
    function flushList() {
      if (list.length > 0) blocks.push({ type: 'list', items: list });
      list = [];
    }

    for (const line of page.lines) {
      const level = headingLevel(line.fontSize, body);
      if (level) {
        flushParagraph();
        flushList();
        blocks.push({ type: 'heading', level, text: line.text });
        continue;
      }
      if (isListItem(line.text)) {
        flushParagraph();
        list.push(stripListMarker(line.text));
        continue;
      }
      flushList();
      paragraph.push(line.text);
    }
    flushParagraph();
    flushList();

    return blocks;
  });
}
