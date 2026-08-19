import type { ToolProcessor } from '@tools/tool_engine';
import { sortLines, type SortMode } from '@/lib/text/text_sorter';

export interface TextSorterOptions {
  mode?: SortMode;
}

const textSorter: ToolProcessor<TextSorterOptions> = async (
  { text, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Arranging' });
  const result = sortLines(text ?? '', options?.mode ?? 'az');
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'sorted-lines.txt',
        mime_type: 'text/plain',
        blob: new Blob([result], { type: 'text/plain' }),
      },
    ],
    text: result,
  };
};

export default textSorter;
