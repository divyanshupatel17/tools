import type { ToolProcessor } from '@tools/tool_engine';
import { DEFAULT_CODE_MINIFY_OPTIONS, minifyCode, type CodeMinifyOptions } from './minify';
import { languageById } from './languages';

export type CodeMinifierOptions = Partial<CodeMinifyOptions> & { language?: string };

const codeMinifier: ToolProcessor<CodeMinifierOptions> = async (
  { text, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Minifying' });
  const languageId = options?.language ?? 'javascript';
  const language = languageById(languageId);

  const result = await minifyCode(text ?? '', languageId, {
    removeComments: options?.removeComments ?? DEFAULT_CODE_MINIFY_OPTIONS.removeComments,
    mangleNames: options?.mangleNames ?? DEFAULT_CODE_MINIFY_OPTIONS.mangleNames,
  });
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: `minified.${language.extension}`,
        mime_type: 'text/plain',
        blob: new Blob([result.output], { type: 'text/plain' }),
      },
    ],
    text: result.output,
  };
};

export default codeMinifier;
