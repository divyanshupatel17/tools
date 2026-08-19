import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { buildDocx } from '@/lib/office/docx_writer';
import { extractPdfText } from '@/lib/pdf/pdf_text';
import { classifyPdfTextBlocks } from '@/lib/pdf/pdf_text_blocks';

export type PdfToWordOptions = Record<string, unknown>;

/**
 * Runs the same text extraction and heading/list heuristics as PDF to Markdown/HTML
 * (`lib/pdf/pdf_text_blocks.ts`) and serialises the result as a minimal .docx
 * (`lib/office/docx_writer.ts`). Table layout is not reconstructed, the same limitation those
 * two tools already disclose — this shares their heuristic, not a better one.
 */
const pdfToWord: ToolProcessor<PdfToWordOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to convert.');

  context.on_progress?.({ ratio: 0.1, label: 'Reading the document' });
  const pages = await extractPdfText(file, context.signal, (done, total) =>
    context.on_progress?.({
      ratio: 0.1 + 0.6 * (done / total),
      label: `Reading page ${done} of ${total}`,
    }),
  );

  const perPage = classifyPdfTextBlocks(pages);
  if (perPage.every((blocks) => blocks.length === 0)) {
    throw new ProcessorError('empty', 'No readable text was found in this PDF.');
  }

  context.on_progress?.({ ratio: 0.8, label: 'Building the document' });
  const bytes = await buildDocx(perPage, replaceExtension(file.name, '').replace(/\.$/, ''));
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'docx'),
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        blob: new Blob([new Uint8Array(bytes)], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      },
    ],
  };
};

export default pdfToWord;
