import { classifyPdfTextBlocks, type TextBlock } from './pdf_text_blocks';
import type { PdfTextPage } from './pdf_text';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function blockToHtml(block: TextBlock): string {
  if (block.type === 'heading')
    return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
  if (block.type === 'list') {
    const items = block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n    ');
    return `<ul>\n    ${items}\n  </ul>`;
  }
  return `<p>${escapeHtml(block.text)}</p>`;
}

/** Each source page becomes its own `<section>`, so the document's pagination survives. */
export function pdfTextToHtml(pages: readonly PdfTextPage[], title: string): string {
  const sections = classifyPdfTextBlocks(pages)
    .map((blocks) => blocks.map(blockToHtml).join('\n  '))
    .map((body) => `<section>\n  ${body}\n</section>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
</head>
<body>
${sections}
</body>
</html>
`;
}
