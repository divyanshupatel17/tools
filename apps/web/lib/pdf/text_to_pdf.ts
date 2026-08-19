import { drawUnicodeText, loadUnicodeFonts, wrapUnicodeText } from './unicode_font';
import type { TypesetPageSize } from './pdf_typeset';

export interface TextToPdfOptions {
  pageSize: TypesetPageSize;
  marginPt: number;
  fontSize: number;
  pageNumbers: boolean;
}

/**
 * Renders pasted text line-for-line rather than reflowing it into paragraphs: a line only
 * wraps when it is too wide for the page, so manual line breaks (addresses, code, poems)
 * survive exactly as typed. Uses the embedded Unicode font set (`unicode_font.ts`), not
 * pdf-lib's WinAnsi-only standard fonts, so arrows, smart quotes and non-Latin text don't
 * throw a "WinAnsi cannot encode" error.
 */
export async function renderTextToPdf(
  text: string,
  options: TextToPdfOptions,
): Promise<Uint8Array> {
  const { PDFDocument, PageSizes, rgb } = await import('pdf-lib');
  const document_ = await PDFDocument.create();
  const [width, height] = options.pageSize === 'letter' ? PageSizes.Letter : PageSizes.A4;

  const fonts = await loadUnicodeFonts(document_);
  const font = fonts.regular;

  const size = options.fontSize;
  const lineHeight = size * 1.4;
  const contentWidth = width - options.marginPt * 2;
  const bottomMargin = options.pageNumbers ? options.marginPt + lineHeight : options.marginPt;

  let page = document_.addPage([width, height]);
  let y = height - options.marginPt;

  function newPage() {
    page = document_.addPage([width, height]);
    y = height - options.marginPt;
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const rawLine of lines) {
    const wrapped =
      rawLine.trim() === '' ? [''] : wrapUnicodeText(rawLine, font, fonts, size, contentWidth);
    for (const line of wrapped) {
      if (y - lineHeight < bottomMargin) newPage();
      y -= size;
      if (line)
        drawUnicodeText(page, line, options.marginPt, y, font, fonts, size, [0.1, 0.1, 0.1], rgb);
      y -= lineHeight - size;
    }
  }

  if (options.pageNumbers) {
    const pages = document_.getPages();
    pages.forEach((onePage, index) => {
      const label = `${index + 1} / ${pages.length}`;
      const labelWidth = font.pdf.widthOfTextAtSize(label, 9);
      drawUnicodeText(
        onePage,
        label,
        (width - labelWidth) / 2,
        options.marginPt / 2,
        font,
        fonts,
        9,
        [0.45, 0.45, 0.45],
        rgb,
      );
    });
  }

  return document_.save();
}
