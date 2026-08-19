import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { extractPdfText } from '@/lib/pdf/pdf_text';
import { pdfTextToMarkdown } from '@/lib/pdf/pdf_to_markdown';

const pdfToMarkdown: ToolProcessor = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to convert to Markdown.');

  context.on_progress?.({ ratio: 0, label: 'Reading the document' });
  const pages = await extractPdfText(file, context.signal, (done, total) => {
    context.on_progress?.({ ratio: done / total, label: `Reading page ${done} of ${total}` });
  });

  const markdown = pdfTextToMarkdown(pages);
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'md'),
        mime_type: 'text/markdown',
        blob: new Blob([markdown], { type: 'text/markdown' }),
      },
    ],
    text: String(pages.length),
  };
};

export default pdfToMarkdown;
