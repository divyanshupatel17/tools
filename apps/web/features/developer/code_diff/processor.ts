import type { ToolProcessor } from '@tools/tool_engine';
import { computeDiff, formatUnifiedDiff, type DiffOptions } from '@/lib/text/text_diff';

export interface CodeDiffProcessorOptions extends DiffOptions {
  /** The workspace's right hand code block. `text` carries the left (original). */
  modified_text?: string;
}

const codeDiff: ToolProcessor<CodeDiffProcessorOptions> = async ({ text, options }, { on_progress }) => {
  on_progress?.({ ratio: 0, label: 'Comparing' });
  const original = text ?? '';
  const modified = options?.modified_text ?? '';
  const result = computeDiff(original, modified, {
    ignore_case: options?.ignore_case ?? false,
    ignore_whitespace: options?.ignore_whitespace ?? false,
    ignore_empty_lines: options?.ignore_empty_lines ?? false,
  });
  const report = formatUnifiedDiff(result, 'Original (Left)', 'Modified (Right)');
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'code-diff.diff',
        mime_type: 'text/plain',
        blob: new Blob([report], { type: 'text/plain' }),
      },
    ],
    text: report,
  };
};

export default codeDiff;
