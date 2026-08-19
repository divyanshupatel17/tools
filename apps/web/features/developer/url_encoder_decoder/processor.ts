import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { decodeUrlText, encodeUrlText } from './url_codec';

export type UrlCodecMode = 'encode' | 'decode';
export interface UrlEncoderDecoderOptions {
  mode: UrlCodecMode;
}

const urlEncoderDecoderProcessor: ToolProcessor<UrlEncoderDecoderOptions> = async (
  { text, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Converting' });
  const source = text ?? '';
  if (source.trim() === '') {
    throw new ProcessorError('empty_input', 'There is nothing to convert yet.');
  }

  const mode = options?.mode ?? 'encode';
  let output: string;
  if (mode === 'encode') {
    output = encodeUrlText(source);
  } else {
    const result = decodeUrlText(source);
    if (!result.ok) throw new ProcessorError('invalid_url_encoding', result.message);
    output = result.text;
  }
  on_progress?.({ ratio: 1, label: 'Done' });

  const fileName = mode === 'encode' ? 'encoded.txt' : 'decoded.txt';
  return {
    artifacts: [{ file_name: fileName, mime_type: 'text/plain', blob: new Blob([output], { type: 'text/plain' }) }],
    text: output,
  };
};

export default urlEncoderDecoderProcessor;
