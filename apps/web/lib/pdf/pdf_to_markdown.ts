import { classifyPdfTextBlocks, type TextBlock } from './pdf_text_blocks';
import type { PdfTextPage } from './pdf_text';

function blockToMarkdown(block: TextBlock): string {
  if (block.type === 'heading') return `${'#'.repeat(block.level)} ${block.text}`;
  if (block.type === 'list') return block.items.map((item) => `- ${item}`).join('\n');
  return block.text;
}

/** Pages are separated by a horizontal rule so the source pagination stays visible. */
export function pdfTextToMarkdown(pages: readonly PdfTextPage[]): string {
  const perPage = classifyPdfTextBlocks(pages).map((blocks) =>
    blocks.map(blockToMarkdown).join('\n\n'),
  );
  return perPage.filter((page) => page.trim() !== '').join('\n\n---\n\n');
}
