import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { readXlsxGrid } from '@/lib/office/xlsx_reader';
import { renderBlocksToPdf, type DocBlock } from '@/lib/pdf/pdf_typeset';

export type ExcelToPdfOptions = Record<string, unknown>;

/**
 * Reads the first sheet of an .xlsx (`lib/office/xlsx_reader.ts`) and typesets it as a single
 * table with the shared typesetter Markdown/HTML to PDF use — a spreadsheet's rows and columns
 * map onto a table far more directly than free text does, so this is the one Office-to-PDF
 * conversion in this app that keeps the source's actual structure rather than approximating it.
 * Only the first sheet; formulas resolve to whatever value the spreadsheet last calculated.
 */
const excelToPdf: ToolProcessor<ExcelToPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add an XLSX file to convert.');

  context.on_progress?.({ ratio: 0.1, label: 'Reading the spreadsheet' });
  let grid: string[][];
  try {
    grid = await readXlsxGrid(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new ProcessorError('unreadable', 'That file could not be read as an .xlsx.');
  }

  const rows = grid.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length === 0) throw new ProcessorError('empty', 'No data was found on the first sheet.');

  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const block: DocBlock = {
    type: 'table',
    rows: rows.map((row) => {
      const cells = [...row];
      while (cells.length < width) cells.push('');
      return cells.map((value) => [{ text: value }]);
    }),
  };

  context.on_progress?.({ ratio: 0.6, label: 'Laying out the PDF' });
  const bytes = await renderBlocksToPdf([block], { pageSize: 'a4', marginPt: 40, fontSize: 10 });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'pdf'),
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
  };
};

export default excelToPdf;
