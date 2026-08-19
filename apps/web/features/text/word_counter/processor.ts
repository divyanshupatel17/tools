import type { ToolProcessor } from '@tools/tool_engine';
import { buildWordCountReport, countWords, type WordCountOptions } from '@/lib/text/word_counter';

const wordCounter: ToolProcessor<WordCountOptions> = async ({ text, options }, { on_progress }) => {
  on_progress?.({ ratio: 0, label: 'Counting' });
  const stats = countWords(text ?? '', options);
  const report = buildWordCountReport(stats);
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'word-count-report.txt',
        mime_type: 'text/plain',
        blob: new Blob([report], { type: 'text/plain' }),
      },
    ],
    text: report,
  };
};

export default wordCounter;
