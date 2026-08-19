import type { ToolProcessor } from '@tools/tool_engine';
import { reverseText, type ReverseMode } from '@/lib/text/text_reverser';

export interface TextReverserOptions {
  mode?: ReverseMode;
}

const textReverser: ToolProcessor<TextReverserOptions> = async (
  { text, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Reversing' });
  const reversed = reverseText(text ?? '', options?.mode ?? 'text');
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'reversed-text.txt',
        mime_type: 'text/plain',
        blob: new Blob([reversed], { type: 'text/plain' }),
      },
    ],
    text: reversed,
  };
};

export default textReverser;
