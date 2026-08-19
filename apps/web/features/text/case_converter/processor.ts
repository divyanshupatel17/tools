import type { ToolProcessor } from '@tools/tool_engine';
import { CASE_OPTIONS, convertCase, type CaseId } from '@/lib/text/case_converter';

export interface CaseConverterOptions {
  case?: CaseId;
}

const caseConverter: ToolProcessor<CaseConverterOptions> = async (
  { text, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Converting' });
  const caseId = options?.case ?? 'sentence';
  const converted = convertCase(text ?? '', caseId);
  const option = CASE_OPTIONS.find((entry) => entry.id === caseId);
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: `${option?.fileName ?? caseId}.txt`,
        mime_type: 'text/plain',
        blob: new Blob([converted], { type: 'text/plain' }),
      },
    ],
    text: converted,
  };
};

export default caseConverter;
