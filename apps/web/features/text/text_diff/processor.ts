import type { ToolProcessor } from '@tools/tool_engine';
import { computeDiff, formatUnifiedDiff, type DiffOptions } from '@/lib/text/text_diff';

export interface TextDiffProcessorOptions extends DiffOptions {
  /** The workspace's second text block. `text` carries the first (the original). */
  modified_text?: string;
}

const textDiff: ToolProcessor<TextDiffProcessorOptions> = async ({ text, options }, { on_progress }) => {
  on_progress?.({ ratio: 0, label: 'Comparing' });
  const original = text ?? '';
  const modified = options?.modified_text ?? '';
  const result = computeDiff(original, modified, {
    ignore_case: options?.ignore_case ?? false,
    ignore_whitespace: options?.ignore_whitespace ?? false,
  });
  const report = formatUnifiedDiff(result, 'Text Block 1 (Original)', 'Text Block 2 (Modified)');
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'text-diff.txt',
        mime_type: 'text/plain',
        blob: new Blob([report], { type: 'text/plain' }),
      },
    ],
    text: report,
  };
};

export default textDiff;
