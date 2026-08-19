import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { DEFAULT_JSON_FORMAT_OPTIONS, parseJson, stringifyJson, type JsonFormatOptions } from './parse';

export type JsonFormatterOptions = Partial<JsonFormatOptions>;

const jsonFormatter: ToolProcessor<JsonFormatterOptions> = async ({ text, options }, { on_progress }) => {
  on_progress?.({ ratio: 0, label: 'Validating' });
  const parsed = parseJson(text ?? '');
  if (!parsed.valid) {
    throw new ProcessorError(
      'invalid_json',
      `Invalid JSON at line ${parsed.error.line}, column ${parsed.error.column}: ${parsed.error.message}`,
    );
  }

  const output = stringifyJson(parsed.value, {
    indent: options?.indent ?? DEFAULT_JSON_FORMAT_OPTIONS.indent,
    sortKeys: options?.sortKeys ?? DEFAULT_JSON_FORMAT_OPTIONS.sortKeys,
  });
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'formatted.json',
        mime_type: 'application/json',
        blob: new Blob([output], { type: 'application/json' }),
      },
    ],
    text: output,
  };
};

export default jsonFormatter;
