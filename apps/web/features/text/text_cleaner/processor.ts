import type { ToolProcessor } from '@tools/tool_engine';
import { cleanText, DEFAULT_CLEAN_OPTIONS, type CleanOptions } from '@/lib/text/text_cleaner';

const textCleaner: ToolProcessor<Partial<CleanOptions>> = async (
  { text, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Cleaning' });
  const cleaned = cleanText(text ?? '', { ...DEFAULT_CLEAN_OPTIONS, ...options });
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'cleaned-text.txt',
        mime_type: 'text/plain',
        blob: new Blob([cleaned], { type: 'text/plain' }),
      },
    ],
    text: cleaned,
  };
};

export default textCleaner;
