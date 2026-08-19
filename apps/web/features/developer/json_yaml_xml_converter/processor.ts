import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { convert, detectFormat, FORMAT_EXTENSION, type DataFormat } from './convert';

const MIME_TYPE: Record<DataFormat, string> = {
  json: 'application/json',
  yaml: 'application/yaml',
  xml: 'application/xml',
};

export interface DataConverterOptions {
  from?: DataFormat;
  to: DataFormat;
}

const jsonYamlXmlConverter: ToolProcessor<DataConverterOptions> = async (
  { text, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Converting' });
  const source = text ?? '';
  const from = options?.from ?? detectFormat(source);
  if (!from) {
    throw new ProcessorError('empty_input', 'There is nothing to convert yet.');
  }
  const to = options?.to;
  if (!to) {
    throw new ProcessorError('missing_target', 'Choose an output format to convert to.');
  }

  const result = await convert(source, from, to);
  if (!result.ok) {
    throw new ProcessorError('invalid_input', result.message);
  }
  on_progress?.({ ratio: 1, label: 'Done' });

  const extension = FORMAT_EXTENSION[to];
  return {
    artifacts: [
      {
        file_name: `converted.${extension}`,
        mime_type: MIME_TYPE[to],
        blob: new Blob([result.text], { type: MIME_TYPE[to] }),
      },
    ],
    text: result.text,
  };
};

export default jsonYamlXmlConverter;
