import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { generateUuids, type UuidVersion } from './uuid';

export interface UuidGeneratorOptions {
  version?: UuidVersion;
  count?: number;
  uppercase?: boolean;
  hyphen?: boolean;
  braces?: boolean;
  namespace?: string;
  name?: string;
}

const MAX_COUNT = 10000;

const uuidGenerator: ToolProcessor<UuidGeneratorOptions> = async ({ options }) => {
  const version = options?.version ?? 'v4';
  const count = options?.count ?? 5;
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new ProcessorError('invalid_count', `Choose between 1 and ${MAX_COUNT} UUIDs to generate.`);
  }
  if ((version === 'v3' || version === 'v5') && (!options?.namespace || !options.name)) {
    throw new ProcessorError('missing_name', 'Enter a namespace and a name to generate this UUID version.');
  }

  const uuids = await generateUuids({
    version,
    count,
    format: {
      uppercase: options?.uppercase ?? false,
      hyphen: options?.hyphen ?? true,
      braces: options?.braces ?? false,
    },
    namespace: options?.namespace,
    name: options?.name,
  });
  const content = uuids.join('\n');

  return {
    artifacts: [
      {
        file_name: 'uuids.txt',
        mime_type: 'text/plain',
        blob: new Blob([content], { type: 'text/plain' }),
      },
    ],
    text: content,
  };
};

export default uuidGenerator;
