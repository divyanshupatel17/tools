import type { ToolProcessor } from '@tools/tool_engine';
import { DEFAULT_CODE_FORMAT_OPTIONS, formatCode, type CodeFormatOptions } from './format';
import { languageById } from './languages';

export type CodeFormatterOptions = Partial<CodeFormatOptions> & { language?: string };

const codeFormatter: ToolProcessor<CodeFormatterOptions> = async (
  { text, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Formatting' });
  const languageId = options?.language ?? 'javascript';
  const language = languageById(languageId);

  const result = await formatCode(text ?? '', languageId, {
    autoFormat: options?.autoFormat ?? DEFAULT_CODE_FORMAT_OPTIONS.autoFormat,
    removeExtraSpaces: options?.removeExtraSpaces ?? DEFAULT_CODE_FORMAT_OPTIONS.removeExtraSpaces,
    sortImports: options?.sortImports ?? DEFAULT_CODE_FORMAT_OPTIONS.sortImports,
    convertQuotes: options?.convertQuotes ?? DEFAULT_CODE_FORMAT_OPTIONS.convertQuotes,
    wrapLines: options?.wrapLines ?? DEFAULT_CODE_FORMAT_OPTIONS.wrapLines,
    wrapWidth: options?.wrapWidth ?? DEFAULT_CODE_FORMAT_OPTIONS.wrapWidth,
    finalNewline: options?.finalNewline ?? DEFAULT_CODE_FORMAT_OPTIONS.finalNewline,
  });
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: `formatted.${language.extension}`,
        mime_type: 'text/plain',
        blob: new Blob([result.output], { type: 'text/plain' }),
      },
    ],
    text: result.output,
  };
};

export default codeFormatter;
