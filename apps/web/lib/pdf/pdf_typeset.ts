import {
  drawInlineLine,
  drawUnicodeText,
  loadUnicodeFonts,
  wrapInlineSpans,
  wrapUnicodeText,
  type InlineSpan,
  type LoadedFont,
  type PdfLibModule,
  type PdfPage,
  type UnicodeFonts,
} from './unicode_font';

export type { InlineSpan } from './unicode_font';

export type DocBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; spans: InlineSpan[] }
  | { type: 'paragraph'; spans: InlineSpan[] }
  | { type: 'list'; ordered: boolean; items: InlineSpan[][] }
  | { type: 'code'; lines: string[] }
  | { type: 'table'; rows: InlineSpan[][][] }
  | { type: 'hr' }
  | { type: 'blockquote'; lines: InlineSpan[][] }
  /** Forces a new page regardless of remaining space — for a source with its own real page or
   * slide boundaries (PowerPoint to PDF, one PDF page per slide), where letting content flow
   * across pages the way body text does would lose that boundary. */
  | { type: 'pagebreak' };

export type TypesetPageSize = 'a4' | 'letter';

export interface TypesetOptions {
  pageSize: TypesetPageSize;
  marginPt: number;
  /** Body text size in points; headings, code and table cells scale off this. */
  fontSize: number;
}

const HEADING_RATIOS: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 2.0,
  2: 1.7,
  3: 1.4,
  4: 1.2,
  5: 1.1,
  6: 1.0,
};

class Typesetter {
  private page!: PdfPage;
  private cursorY = 0;
  private readonly pages: PdfPage[] = [];

  constructor(
    private readonly document_: Awaited<ReturnType<PdfLibModule['PDFDocument']['create']>>,
    private readonly pageWidth: number,
    private readonly pageHeight: number,
    private readonly margin: number,
    private readonly rgb: PdfLibModule['rgb'],
  ) {
    this.addPage();
  }

  get contentWidth(): number {
    return this.pageWidth - this.margin * 2;
  }

  addPage(): void {
    this.page = this.document_.addPage([this.pageWidth, this.pageHeight]);
    this.pages.push(this.page);
    this.cursorY = this.pageHeight - this.margin;
  }

  ensureSpace(height: number): void {
    if (this.cursorY - height < this.margin) this.addPage();
  }

  drawLine(
    text: string,
    font: LoadedFont,
    fonts: UnicodeFonts,
    size: number,
    x: number,
    color: [number, number, number] = [0.1, 0.1, 0.1],
  ): void {
    const lineHeight = size * 1.4;
    this.ensureSpace(lineHeight);
    this.cursorY -= size;
    drawUnicodeText(this.page, text, x, this.cursorY, font, fonts, size, color, this.rgb);
    this.cursorY -= lineHeight - size;
  }

  drawWrapped(
    text: string,
    font: LoadedFont,
    fonts: UnicodeFonts,
    size: number,
    x: number,
    width: number,
    color?: [number, number, number],
  ): void {
    for (const line of wrapUnicodeText(text, font, fonts, size, width))
      this.drawLine(line, font, fonts, size, x, color);
  }

  /** Wraps and draws inline-styled spans (bold/italic/code), one already-wrapped line per call to `drawInlineLine`. */
  drawSpansWrapped(
    spans: readonly InlineSpan[],
    fonts: UnicodeFonts,
    size: number,
    x: number,
    width: number,
    color: [number, number, number] = [0.1, 0.1, 0.1],
  ): void {
    const lineHeight = size * 1.4;
    for (const line of wrapInlineSpans(spans, fonts, size, width)) {
      this.ensureSpace(lineHeight);
      this.cursorY -= size;
      drawInlineLine(this.page, line, x, this.cursorY, size, color, this.rgb);
      this.cursorY -= lineHeight - size;
    }
  }

  addGap(height: number): void {
    this.ensureSpace(height);
    this.cursorY -= height;
  }

  fillRect(x: number, width: number, height: number, color: [number, number, number]): void {
    this.ensureSpace(height);
    this.page.drawRectangle({
      x,
      y: this.cursorY - height,
      width,
      height,
      color: this.rgb(...color),
    });
  }

  drawRuleAt(y: number, width: number, x: number, color: [number, number, number]): void {
    this.page.drawLine({
      start: { x, y },
      end: { x: x + width, y },
      thickness: 0.75,
      color: this.rgb(...color),
    });
  }

  get y(): number {
    return this.cursorY;
  }

  set y(value: number) {
    this.cursorY = value;
  }

  get currentPage(): PdfPage {
    return this.page;
  }

  pageCount(): number {
    return this.pages.length;
  }
}

/**
 * Typesets a generic block model (produced by a Markdown or HTML parser) into a PDF, using
 * embedded Unicode fonts (`unicode_font.ts`) rather than pdf-lib's WinAnsi-only standard fonts,
 * so arrows, smart quotes and non-Latin text never throw a "WinAnsi cannot encode" error, and
 * inline styling (`**bold**`, `*italic*`, `` `code` ``) draws in the matching font instead of
 * as literal markup.
 */
export async function renderBlocksToPdf(
  blocks: readonly DocBlock[],
  options: TypesetOptions,
): Promise<Uint8Array> {
  const { PDFDocument, PageSizes, rgb } = await import('pdf-lib');
  const document_ = await PDFDocument.create();
  const [width, height] = options.pageSize === 'letter' ? PageSizes.Letter : PageSizes.A4;

  const fonts = await loadUnicodeFonts(document_);

  const ts = new Typesetter(document_, width, height, options.marginPt, rgb);
  const bodySize = options.fontSize;

  for (const block of blocks) {
    if (block.type === 'pagebreak') {
      ts.addPage();
      continue;
    }

    if (block.type === 'heading') {
      ts.addGap(block.level <= 2 ? 10 : 6);
      const size = Math.round(bodySize * HEADING_RATIOS[block.level]);
      // Headings default to bold unless a span already carries its own style (e.g. inline code).
      const spans = block.spans.map((span) => ({ ...span, bold: span.bold ?? true }));
      ts.drawSpansWrapped(spans, fonts, size, options.marginPt, ts.contentWidth);
      ts.addGap(4);
      continue;
    }

    if (block.type === 'paragraph') {
      ts.drawSpansWrapped(block.spans, fonts, bodySize, options.marginPt, ts.contentWidth);
      ts.addGap(bodySize * 0.6);
      continue;
    }

    if (block.type === 'list') {
      const indent = bodySize * 1.4;
      block.items.forEach((item, index) => {
        const prefix = block.ordered ? `${index + 1}.` : '•';
        const lines = wrapInlineSpans(item, fonts, bodySize, ts.contentWidth - indent);
        lines.forEach((line, lineIndex) => {
          const x = options.marginPt + indent;
          const lineHeight = bodySize * 1.4;
          ts.ensureSpace(lineHeight);
          ts.y -= bodySize;
          if (lineIndex === 0) {
            drawUnicodeText(
              ts.currentPage,
              prefix,
              options.marginPt,
              ts.y,
              fonts.regular,
              fonts,
              bodySize,
              [0.1, 0.1, 0.1],
              rgb,
            );
          }
          drawInlineLine(ts.currentPage, line, x, ts.y, bodySize, [0.1, 0.1, 0.1], rgb);
          ts.y -= lineHeight - bodySize;
        });
      });
      ts.addGap(bodySize * 0.6);
      continue;
    }

    if (block.type === 'code') {
      const codeSize = Math.max(bodySize - 1.5, 8);
      const wrapped = block.lines.flatMap((line) =>
        wrapUnicodeText(line, fonts.mono, fonts, codeSize, ts.contentWidth - 16),
      );
      const lineHeight = codeSize * 1.4;
      const blockHeight = wrapped.length * lineHeight + 12;
      ts.ensureSpace(blockHeight);
      ts.fillRect(options.marginPt, ts.contentWidth, blockHeight, [0.94, 0.94, 0.94]);
      ts.addGap(6);
      for (const line of wrapped)
        ts.drawLine(line || ' ', fonts.mono, fonts, codeSize, options.marginPt + 8);
      ts.addGap(6);
      continue;
    }

    if (block.type === 'hr') {
      ts.addGap(bodySize * 0.5);
      ts.ensureSpace(1);
      ts.drawRuleAt(ts.y, ts.contentWidth, options.marginPt, [0.75, 0.75, 0.75]);
      ts.addGap(bodySize * 0.5);
      continue;
    }

    if (block.type === 'blockquote') {
      const indent = bodySize * 1.2;
      const startY = ts.y;
      for (const line of block.lines) {
        ts.drawSpansWrapped(
          line,
          fonts,
          bodySize,
          options.marginPt + indent,
          ts.contentWidth - indent,
          [0.4, 0.4, 0.4],
        );
      }
      ts.currentPage.drawLine({
        start: { x: options.marginPt + 2, y: startY },
        end: { x: options.marginPt + 2, y: ts.y },
        thickness: 2,
        color: rgb(0.75, 0.75, 0.75),
      });
      ts.addGap(bodySize * 0.6);
      continue;
    }

    if (block.type === 'table') {
      const columns = Math.max(...block.rows.map((row) => row.length), 1);
      const columnWidth = ts.contentWidth / columns;
      const cellSize = Math.max(bodySize - 1.5, 8);
      const padding = 4;

      block.rows.forEach((row, rowIndex) => {
        const cellSpans = row.map((cell) =>
          rowIndex === 0 ? cell.map((span) => ({ ...span, bold: span.bold ?? true })) : cell,
        );
        const cellLines = cellSpans.map((cell) =>
          wrapInlineSpans(cell, fonts, cellSize, columnWidth - padding * 2),
        );
        const lineHeight = cellSize * 1.35;
        const rowHeight =
          Math.max(...cellLines.map((lines) => lines.length), 1) * lineHeight + padding * 2;

        ts.ensureSpace(rowHeight);
        if (rowIndex === 0)
          ts.fillRect(options.marginPt, ts.contentWidth, rowHeight, [0.92, 0.92, 0.9]);
        const rowTop = ts.y;
        if (rowIndex === 0)
          ts.drawRuleAt(rowTop, ts.contentWidth, options.marginPt, [0.75, 0.75, 0.75]);

        for (let column = 0; column < columns; column += 1) {
          const x = options.marginPt + column * columnWidth;
          let lineY = rowTop - padding - cellSize;
          for (const line of cellLines[column] ?? []) {
            drawInlineLine(
              ts.currentPage,
              line,
              x + padding,
              lineY,
              cellSize,
              [0.1, 0.1, 0.1],
              rgb,
            );
            lineY -= lineHeight;
          }
        }

        ts.y = rowTop - rowHeight;
        ts.drawRuleAt(ts.y, ts.contentWidth, options.marginPt, [0.75, 0.75, 0.75]);
        for (let column = 0; column <= columns; column += 1) {
          const x = options.marginPt + column * columnWidth;
          ts.currentPage.drawLine({
            start: { x, y: rowTop },
            end: { x, y: ts.y },
            thickness: 0.5,
            color: rgb(0.75, 0.75, 0.75),
          });
        }
      });
      ts.addGap(bodySize * 0.6);
      continue;
    }
  }

  return document_.save();
}
