import type { ToolProcessor } from '@tools/tool_engine';

/** Downloads exactly what is in the Input Text box. There is no separate find/replace step
 * here — the edit already happened in place in the workspace's one textarea, so re-running
 * find/replace on download would risk applying it a second time. */
const findReplace: ToolProcessor = async ({ text }, { on_progress }) => {
  on_progress?.({ ratio: 0, label: 'Preparing' });
  const result = text ?? '';
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'find-replace-result.txt',
        mime_type: 'text/plain',
        blob: new Blob([result], { type: 'text/plain' }),
      },
    ],
    text: result,
  };
};

export default findReplace;
