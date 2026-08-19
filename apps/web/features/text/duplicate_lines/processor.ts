import type { ToolProcessor } from '@tools/tool_engine';
import { removeDuplicates, type DuplicateOptions } from '@/lib/text/duplicate_lines';

/** Always exports the deduplicated list — that is this tool's actual deliverable, regardless
 * of whether the workspace itself is currently showing the Highlight or Remove view. */
const duplicateLines: ToolProcessor<DuplicateOptions> = async (
  { text, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Finding duplicates' });
  const result = removeDuplicates(text ?? '', options ?? {}).join('\n');
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'deduplicated-lines.txt',
        mime_type: 'text/plain',
        blob: new Blob([result], { type: 'text/plain' }),
      },
    ],
    text: result,
  };
};

export default duplicateLines;
