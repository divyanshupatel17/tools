import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { parseHtmlToBlocks } from '@/lib/pdf/html_blocks';
import { renderBlocksToPdf, type TypesetPageSize } from '@/lib/pdf/pdf_typeset';

export interface HtmlToPdfOptions {
  page_size?: TypesetPageSize;
  margin?: number;
  font_size?: number;
  file_name?: string;
}

const htmlToPdf: ToolProcessor<HtmlToPdfOptions> = async (input, context) => {
  const html = input.text?.trim() ?? '';
  if (html === '') throw new ProcessorError('missing_text', 'Paste some HTML to convert.');

  context.on_progress?.({ ratio: 0, label: 'Typesetting' });
  const blocks = parseHtmlToBlocks(input.text ?? '');
  if (blocks.length === 0) throw new ProcessorError('no_content', 'No readable text was found in that HTML.');

  const bytes = await renderBlocksToPdf(blocks, {
    pageSize: input.options.page_size ?? 'a4',
    marginPt: input.options.margin ?? 54,
    fontSize: input.options.font_size ?? 11,
  });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  const base = input.options.file_name?.trim();

  return {
    artifacts: [
      {
        file_name: base ? `${base}.pdf` : 'page.pdf',
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
  };
};

export default htmlToPdf;
