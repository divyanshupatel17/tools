import type { ToolProcessor } from '@tools/tool_engine';
import {
  analyzeText,
  buildTextAnalysisReport,
  type TextAnalyzerOptions,
} from '@/lib/text/text_analyzer';

const textAnalyzer: ToolProcessor<TextAnalyzerOptions> = async (
  { text, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Analyzing' });
  const stats = analyzeText(text ?? '', options);
  const report = buildTextAnalysisReport(stats);
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'text-statistics-report.txt',
        mime_type: 'text/plain',
        blob: new Blob([report], { type: 'text/plain' }),
      },
    ],
    text: report,
  };
};

export default textAnalyzer;
