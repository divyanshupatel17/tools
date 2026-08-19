import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension, safeFileName } from '@tools/file_utils';
import { extractPdfText } from '@/lib/pdf/pdf_text';
import { pdfTextToHtml } from '@/lib/pdf/pdf_to_html';

const pdfToHtml: ToolProcessor = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to convert to HTML.');

  context.on_progress?.({ ratio: 0, label: 'Reading the document' });
  const pages = await extractPdfText(file, context.signal, (done, total) => {
    context.on_progress?.({ ratio: done / total, label: `Reading page ${done} of ${total}` });
  });

  const title = replaceExtension(safeFileName(file.name), '').replace(/\.$/, '');
  const html = pdfTextToHtml(pages, title);
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'html'),
        mime_type: 'text/html',
        blob: new Blob([html], { type: 'text/html' }),
      },
    ],
    text: String(pages.length),
  };
};

export default pdfToHtml;
