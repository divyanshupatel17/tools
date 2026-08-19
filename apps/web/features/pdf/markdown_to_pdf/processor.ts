import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { parseMarkdownToBlocks } from '@/lib/pdf/markdown_blocks';
import { renderBlocksToPdf, type TypesetPageSize } from '@/lib/pdf/pdf_typeset';

export interface MarkdownToPdfOptions {
  page_size?: TypesetPageSize;
  margin?: number;
  font_size?: number;
  file_name?: string;
}

const markdownToPdf: ToolProcessor<MarkdownToPdfOptions> = async (input, context) => {
  const text = input.text?.trim() ?? '';
  if (text === '') throw new ProcessorError('missing_text', 'Paste some Markdown to convert.');

  context.on_progress?.({ ratio: 0, label: 'Typesetting' });
  const blocks = parseMarkdownToBlocks(input.text ?? '');
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
        file_name: base ? `${base}.pdf` : 'markdown.pdf',
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
  };
};

export default markdownToPdf;
