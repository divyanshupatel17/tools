import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { renderTextToPdf } from '@/lib/pdf/text_to_pdf';
import type { TypesetPageSize } from '@/lib/pdf/pdf_typeset';

export interface TextToPdfOptions {
  page_size?: TypesetPageSize;
  margin?: number;
  font_size?: number;
  page_numbers?: boolean;
  file_name?: string;
}

const textToPdf: ToolProcessor<TextToPdfOptions> = async (input, context) => {
  const text = input.text?.trim() ?? '';
  if (text === '') throw new ProcessorError('missing_text', 'Paste some text to lay out.');

  context.on_progress?.({ ratio: 0, label: 'Typesetting' });
  const bytes = await renderTextToPdf(input.text ?? '', {
    pageSize: input.options.page_size ?? 'a4',
    marginPt: input.options.margin ?? 54,
    fontSize: input.options.font_size ?? 12,
    pageNumbers: input.options.page_numbers ?? false,
  });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const base = input.options.file_name?.trim();

  return {
    artifacts: [
      {
        file_name: base ? `${base}.pdf` : 'text.pdf',
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
  };
};

export default textToPdf;
