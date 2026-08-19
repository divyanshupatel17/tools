import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { extractPdfText } from '@/lib/pdf/pdf_text';
import { diffPages, type PageDiffSummary } from '@/lib/pdf/text_diff';

export type ComparePdfOptions = Record<string, unknown>;

export interface CompareReport {
  pageCount: number;
  changedPages: number;
  pages: PageDiffSummary[];
}

/**
 * Extracts each document's text (`lib/pdf/pdf_text.ts`, the same reader PDF to Text uses) and
 * runs a line-level diff per page, aligned by page index. This is a text comparison, not a
 * pixel one — a page that only moved images around with identical text reads as unchanged, and
 * a change in layout that does not change the extracted reading order (e.g. reflowed text) can
 * show as a same-content diff even if it looks different. The result is returned entirely
 * through `text` as JSON; there is nothing to download, since the report itself is the result.
 */
const comparePdf: ToolProcessor<ComparePdfOptions> = async (input, context) => {
  const before = input.files[0];
  const after = input.files[1];
  if (!before || !after) throw new ProcessorError('missing_file', 'Add two PDFs to compare.');

  context.on_progress?.({ ratio: 0.1, label: 'Reading the first document' });
  const beforePages = await extractPdfText(before, context.signal, (done, total) =>
    context.on_progress?.({
      ratio: 0.1 + 0.4 * (done / total),
      label: `Reading document 1 · page ${done} of ${total}`,
    }),
  );

  context.on_progress?.({ ratio: 0.5, label: 'Reading the second document' });
  const afterPages = await extractPdfText(after, context.signal, (done, total) =>
    context.on_progress?.({
      ratio: 0.5 + 0.4 * (done / total),
      label: `Reading document 2 · page ${done} of ${total}`,
    }),
  );

  const beforeLines = beforePages.map((page) => page.lines.map((line) => line.text));
  const afterLines = afterPages.map((page) => page.lines.map((line) => line.text));
  const pages = diffPages(beforeLines, afterLines);

  context.on_progress?.({ ratio: 1, label: 'Done' });

  const report: CompareReport = {
    pageCount: pages.length,
    changedPages: pages.filter((page) => page.changed).length,
    pages,
  };

  return { artifacts: [], text: JSON.stringify(report) };
};

export default comparePdf;
