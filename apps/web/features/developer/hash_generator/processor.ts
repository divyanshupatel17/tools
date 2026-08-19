import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { HASH_ALGORITHMS, hashAll, type HashAlgorithm } from './hash_ops';

export interface HashGeneratorOptions {
  algorithms?: HashAlgorithm[];
}

const hashGenerator: ToolProcessor<HashGeneratorOptions> = async ({ text, files, options }, { on_progress }) => {
  const algorithms = options?.algorithms?.length ? options.algorithms : HASH_ALGORITHMS;
  const file = files?.[0];

  on_progress?.({ ratio: 0, label: 'Hashing' });

  const bytes = file
    ? new Uint8Array(await file.arrayBuffer())
    : new TextEncoder().encode(text ?? '');

  if (bytes.length === 0) {
    throw new ProcessorError('empty_input', 'There is nothing to hash yet.');
  }

  const rows = await hashAll(algorithms, bytes);
  on_progress?.({ ratio: 1, label: 'Done' });

  const content = rows.map((row) => `${row.algorithm}: ${row.value}`).join('\n');

  return {
    artifacts: [
      {
        file_name: 'hashes.txt',
        mime_type: 'text/plain',
        blob: new Blob([content], { type: 'text/plain' }),
      },
    ],
    text: content,
  };
};

export default hashGenerator;
