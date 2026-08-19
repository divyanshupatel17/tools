import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { parseUrl } from './parse_url';

export interface UrlParserOptions {
  [key: string]: never;
}

const urlParserProcessor: ToolProcessor<UrlParserOptions> = async ({ text }, { on_progress }) => {
  on_progress?.({ ratio: 0, label: 'Parsing' });
  const result = parseUrl(text ?? '');
  if (!result.ok) {
    throw new ProcessorError('invalid_url', result.message);
  }
  on_progress?.({ ratio: 1, label: 'Done' });

  const output = JSON.stringify(
    { ...result.url, searchParams: Object.fromEntries(result.url.searchParams) },
    null,
    2,
  );
  return {
    artifacts: [
      { file_name: 'parsed-url.json', mime_type: 'application/json', blob: new Blob([output], { type: 'application/json' }) },
    ],
    text: output,
  };
};

export default urlParserProcessor;
