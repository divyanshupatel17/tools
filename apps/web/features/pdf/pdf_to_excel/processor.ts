import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { buildXlsx } from '@/lib/office/xlsx_writer';
import { extractPdfTextItems, type PdfTextItem } from '@/lib/pdf/pdf_text';

export type PdfToExcelOptions = Record<string, unknown>;

/** Items whose baselines fall within this many PDF points of each other are treated as the same
 * row — mirrors the tolerance `pdf_text.ts`'s own `groupIntoLines` uses for the same reason
 * (pdf.js reports one item per style run, not per visual line). */
const ROW_TOLERANCE_PT = 2;

/** Left edges within this many PDF points of each other are treated as the same column. Wide
 * enough to absorb sub-pixel rounding between rows of the same table, narrow enough that two
 * genuinely different columns in a normally-spaced table don't collapse together. */
const COLUMN_TOLERANCE_PT = 10;

/** Groups a page's text items into visual rows by baseline y, the position-based equivalent of
 * `groupIntoLines` in `pdf_text.ts` (kept separate because that one collapses each line down to
 * a single string, discarding the per-item x this needs). */
function groupRows(items: readonly PdfTextItem[]): PdfTextItem[][] {
  const rows: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [];
  let currentY: number | null = null;

  for (const item of items) {
    if (!item.text.trim()) continue;
    if (currentY !== null && Math.abs(currentY - item.y) > ROW_TOLERANCE_PT) {
      rows.push(current);
      current = [];
    }
    current.push(item);
    currentY = item.y;
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

/** Clusters every item's left edge on the page into column anchors: sort all x positions, start
 * a new column whenever the gap from the previous item exceeds the tolerance (single-linkage
 * clustering). Real table columns line up closely row to row and collapse into one anchor each;
 * a column index built this way stays consistent across every row on the page, which is what
 * lets ragged rows land in the same spreadsheet column. */
function clusterColumns(rows: readonly PdfTextItem[][]): number[] {
  const xs = rows
    .flat()
    .map((item) => item.x)
    .sort((a, b) => a - b);

  const anchors: number[] = [];
  let lastMember = -Infinity;
  for (const x of xs) {
    if (x - lastMember > COLUMN_TOLERANCE_PT) anchors.push(x);
    lastMember = x;
  }
  return anchors;
}

function nearestColumn(x: number, anchors: readonly number[]): number {
  let bestIndex = 0;
  let bestDistance = Infinity;
  anchors.forEach((anchor, index) => {
    const distance = Math.abs(x - anchor);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

/** Turns one page's text items into a grid: every row gets one cell per page-wide column
 * anchor, items sharing a column get joined with a space (a cell that wrapped into two style
 * runs), and trailing empty cells are dropped so an ordinary paragraph line — one item, one
 * column — doesn't drag a row of blank cells behind it. */
function pageToRows(items: readonly PdfTextItem[]): string[][] {
  const rows = groupRows(items);
  const anchors = clusterColumns(rows);

  return rows.map((row) => {
    const cells = new Array<string>(anchors.length).fill('');
    for (const item of row) {
      const index = nearestColumn(item.x, anchors);
      const text = item.text.trim();
      if (!text) continue;
      cells[index] = cells[index] ? `${cells[index]} ${text}` : text;
    }
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    return cells;
  });
}

/**
 * Puts every extracted line into its own row, splitting each line into cells by clustering text
 * items' real x positions into page-wide columns (rather than a whitespace-gap heuristic), and
 * writes the result as a single-sheet .xlsx (`lib/office/xlsx_writer.ts`). Pages are separated
 * by a blank row rather than becoming separate sheets — a spreadsheet's own concept of "page"
 * does not map cleanly onto a PDF's.
 */
const pdfToExcel: ToolProcessor<PdfToExcelOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to convert.');

  context.on_progress?.({ ratio: 0.1, label: 'Reading the document' });
  const pages = await extractPdfTextItems(file, context.signal, (done, total) =>
    context.on_progress?.({
      ratio: 0.1 + 0.6 * (done / total),
      label: `Reading page ${done} of ${total}`,
    }),
  );

  const rows: string[][] = [];
  pages.forEach((docPage, index) => {
    if (index > 0) rows.push([]);
    for (const row of pageToRows(docPage.items)) {
      if (row.length > 0) rows.push(row);
    }
  });

  if (rows.length === 0)
    throw new ProcessorError('empty', 'No readable text was found in this PDF.');

  context.on_progress?.({ ratio: 0.8, label: 'Building the spreadsheet' });
  const stem = replaceExtension(file.name, '')
    .replace(/\.$/, '')
    .replace(/[:\\/?*[\]]/g, ' ')
    .trim()
    .slice(0, 31);
  const bytes = await buildXlsx(rows, stem || 'Sheet1');
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'xlsx'),
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        blob: new Blob([new Uint8Array(bytes)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      },
    ],
  };
};

export default pdfToExcel;
