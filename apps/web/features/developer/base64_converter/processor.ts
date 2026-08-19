import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { decodeBase64, encodeBytesToBase64, encodeTextToBase64 } from './base64';

export type Base64Mode = 'encode' | 'decode';

export interface Base64ConverterOptions {
  mode: Base64Mode;
}

const base64Converter: ToolProcessor<Base64ConverterOptions> = async (
  { text, files, options },
  { on_progress },
) => {
  on_progress?.({ ratio: 0, label: 'Converting' });
  const mode = options?.mode ?? 'encode';
  const file = files?.[0];

  if (mode === 'encode') {
    const base64 = file
      ? encodeBytesToBase64(new Uint8Array(await file.arrayBuffer()))
      : encodeTextToBase64(text ?? '');
    if (base64 === '') {
      throw new ProcessorError('empty_input', 'There is nothing to encode yet.');
    }
    on_progress?.({ ratio: 1, label: 'Done' });
    return {
      artifacts: [
        {
          file_name: 'encoded.txt',
          mime_type: 'text/plain',
          blob: new Blob([base64], { type: 'text/plain' }),
        },
      ],
      text: base64,
    };
  }

  const result = decodeBase64(text ?? '');
  if (!result.ok) {
    throw new ProcessorError('invalid_base64', result.message);
  }
  on_progress?.({ ratio: 1, label: 'Done' });
  const isText = result.text !== null;
  return {
    artifacts: [
      {
        file_name: isText ? 'decoded.txt' : 'decoded.bin',
        mime_type: isText ? 'text/plain' : 'application/octet-stream',
        blob: new Blob([new Uint8Array(result.bytes)]),
      },
    ],
    text: result.text ?? '',
  };
};

export default base64Converter;
