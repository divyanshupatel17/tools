import type { PdfTextPage } from './pdf_text';

/** Pages are separated by a form feed, the conventional plain-text page break. */
export function pdfTextToPlainText(pages: readonly PdfTextPage[]): string {
  return pages.map((page) => page.lines.map((line) => line.text).join('\n')).join('\n\f\n');
}
