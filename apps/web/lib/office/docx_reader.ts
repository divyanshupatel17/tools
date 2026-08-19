import type { DocBlock, InlineSpan } from '@/lib/pdf/pdf_typeset';
import { readOoxmlPackage, readOoxmlText, stripXmlTags } from './ooxml';

const HEADING_STYLE = /^Heading(\d)$/;

function paragraphStyle(xml: string): string | null {
  const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(xml)?.[1];
  if (!pPr) return null;
  return /<w:pStyle\s+w:val="([^"]+)"/.exec(pPr)?.[1] ?? null;
}

/** Runs (`<w:r>`) inside one paragraph or table cell, each with its own bold/italic flags from
 * `<w:rPr>` — the same run-level granularity `markdown_inline.ts`/`html_blocks.ts` produce for
 * the other "build a document" tools, so the shared typesetter draws Word's bold/italic the
 * same way it draws `**bold**` or `<b>`. */
function paragraphSpans(xml: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const runPattern = /<w:r>([\s\S]*?)<\/w:r>/g;
  let match: RegExpExecArray | null;
  while ((match = runPattern.exec(xml))) {
    const run = match[1]!;
    const rPr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] ?? '';
    const bold = /<w:b\s*\/?>|<w:b\s+w:val="(?:true|1)"/.test(rPr);
    const italic = /<w:i\s*\/?>|<w:i\s+w:val="(?:true|1)"/.test(rPr);
    const textPattern = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let textMatch: RegExpExecArray | null;
    let text = '';
    while ((textMatch = textPattern.exec(run))) text += stripXmlTags(textMatch[1]!);
    if (/<w:tab\s*\/>/.test(run)) text += '\t';
    if (text)
      spans.push({ text, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}) });
  }
  return spans;
}

function tableRows(xml: string): InlineSpan[][][] {
  const rows: InlineSpan[][][] = [];
  const rowPattern = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml))) {
    const cells: InlineSpan[][] = [];
    const cellPattern = /<w:tc\b[\s\S]*?<\/w:tc>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[0]))) {
      const spans = paragraphSpans(cellMatch[0]);
      cells.push(spans.length > 0 ? spans : [{ text: '' }]);
    }
    rows.push(cells);
  }
  return rows;
}

/** Reads a subset of WordprocessingML back into the same `DocBlock[]` model
 * `renderBlocksToPdf` (`lib/pdf/pdf_typeset.ts`) consumes: paragraphs, Heading1-6 styles,
 * ListParagraph-styled paragraphs as bullet items, and tables. Anything else a real-world .docx
 * can contain — images, headers/footers, footnotes, tracked changes, text boxes, columns — is
 * not read; a document built from those will lose them, not fail outright. */
export async function readDocxBlocks(bytes: Uint8Array): Promise<DocBlock[]> {
  const files = await readOoxmlPackage(bytes);
  const documentXml = await readOoxmlText(files, 'word/document.xml');
  if (!documentXml) throw new Error('This file has no word/document.xml — it may not be a .docx.');

  const bodyMatch =
    /<w:body>([\s\S]*?)<w:sectPr[\s>]/.exec(documentXml) ??
    /<w:body>([\s\S]*?)<\/w:body>/.exec(documentXml);
  const body = bodyMatch?.[1] ?? '';

  const blocks: DocBlock[] = [];
  const blockPattern = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(body))) {
    const chunk = match[0];

    if (chunk.startsWith('<w:tbl')) {
      const rows = tableRows(chunk);
      if (rows.length > 0) blocks.push({ type: 'table', rows });
      continue;
    }

    const style = paragraphStyle(chunk);
    const spans = paragraphSpans(chunk);
    if (spans.length === 0 || spans.every((span) => span.text.trim().length === 0)) continue;

    const heading = style ? HEADING_STYLE.exec(style) : null;
    if (heading) {
      const level = Math.min(6, Math.max(1, Number(heading[1]))) as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ type: 'heading', level, spans });
    } else if (style === 'ListParagraph') {
      const last = blocks[blocks.length - 1];
      if (last?.type === 'list' && !last.ordered) {
        last.items.push(spans);
      } else {
        blocks.push({ type: 'list', ordered: false, items: [spans] });
      }
    } else {
      blocks.push({ type: 'paragraph', spans });
    }
  }

  return blocks;
}
