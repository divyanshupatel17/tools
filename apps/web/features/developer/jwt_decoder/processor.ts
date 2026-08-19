import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { decodeJwt } from './jwt';

export interface JwtDecoderOptions {
  [key: string]: never;
}

const jwtDecoder: ToolProcessor<JwtDecoderOptions> = async ({ text }, { on_progress }) => {
  on_progress?.({ ratio: 0, label: 'Decoding' });

  const result = decodeJwt(text ?? '');
  if (!result.ok) {
    throw new ProcessorError('invalid_jwt', result.message);
  }

  on_progress?.({ ratio: 1, label: 'Done' });

  const content = JSON.stringify(
    { header: result.jwt.header, payload: result.jwt.payload, signature: result.jwt.signature },
    null,
    2,
  );

  return {
    artifacts: [
      {
        file_name: 'decoded-jwt.json',
        mime_type: 'application/json',
        blob: new Blob([content], { type: 'application/json' }),
      },
    ],
    text: content,
  };
};

export default jwtDecoder;
