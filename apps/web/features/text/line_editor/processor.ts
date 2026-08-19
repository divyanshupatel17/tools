import type { ToolProcessor } from '@tools/tool_engine';
import { editLines, type LineEditorOptions } from '@/lib/text/line_editor';

const lineEditor: ToolProcessor<LineEditorOptions> = async (
  { text, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Editing' });
  const result = editLines(text ?? '', options ?? {});
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'edited-lines.txt',
        mime_type: 'text/plain',
        blob: new Blob([result], { type: 'text/plain' }),
      },
    ],
    text: result,
  };
};

export default lineEditor;
