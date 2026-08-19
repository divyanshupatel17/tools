import type { ToolProcessor } from '@tools/tool_engine';
import { formatMarkdown, type MarkdownFormatOptions } from '@/lib/text/markdown/format';

export type MarkdownFormatterOptions = Partial<MarkdownFormatOptions>;

const markdownFormatter: ToolProcessor<MarkdownFormatterOptions> = async (
  { text, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Formatting' });
  const formatted = formatMarkdown(text ?? '', {
    auto_format: options?.auto_format ?? true,
    normalize_line_endings: options?.normalize_line_endings ?? true,
    remove_trailing_spaces: options?.remove_trailing_spaces ?? false,
    fix_indentation: options?.fix_indentation ?? false,
  });
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'formatted.md',
        mime_type: 'text/markdown',
        blob: new Blob([formatted], { type: 'text/markdown' }),
      },
    ],
    text: formatted,
  };
};

export default markdownFormatter;
