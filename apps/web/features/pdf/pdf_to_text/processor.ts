import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { extractPdfText } from '@/lib/pdf/pdf_text';
import { pdfTextToPlainText } from '@/lib/pdf/pdf_to_text';

/** Small enough to run on the main thread; pdf.js already parses off-thread where it can. */
const pdfToText: ToolProcessor = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to extract text from.');

  context.on_progress?.({ ratio: 0, label: 'Reading the document' });
  const pages = await extractPdfText(file, context.signal, (done, total) => {
    context.on_progress?.({ ratio: done / total, label: `Reading page ${done} of ${total}` });
  });

  const text = pdfTextToPlainText(pages);
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'txt'),
        mime_type: 'text/plain',
        blob: new Blob([text], { type: 'text/plain' }),
      },
    ],
    text: String(pages.length),
  };
};

export default pdfToText;
