import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { readDocxBlocks } from '@/lib/office/docx_reader';
import { renderBlocksToPdf } from '@/lib/pdf/pdf_typeset';

export type WordToPdfOptions = Record<string, unknown>;

/**
 * Reads a .docx's paragraphs, headings, lists and tables (`lib/office/docx_reader.ts`) and lays
 * them out with the same typesetter Markdown/HTML to PDF use (`lib/pdf/pdf_typeset.ts`). This is
 * a genuine re-layout, not a reproduction of Word's own pagination — page breaks, columns,
 * headers/footers, images and text boxes are not read, so a heavily designed document will lose
 * that design while its text and basic structure survive.
 */
const wordToPdf: ToolProcessor<WordToPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a DOCX file to convert.');

  context.on_progress?.({ ratio: 0.1, label: 'Reading the document' });
  let blocks;
  try {
    blocks = await readDocxBlocks(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new ProcessorError('unreadable', 'That file could not be read as a .docx.');
  }
  if (blocks.length === 0)
    throw new ProcessorError('empty', 'No readable text was found in this document.');

  context.on_progress?.({ ratio: 0.5, label: 'Laying out the PDF' });
  const bytes = await renderBlocksToPdf(blocks, { pageSize: 'a4', marginPt: 56, fontSize: 11 });
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

export default wordToPdf;
