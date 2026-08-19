import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { findByExtension, findByMimeType } from './mime_types';

export interface MimeTypeLookupOptions {
  extension?: string;
  mimeType?: string;
}

const mimeTypeLookup: ToolProcessor<MimeTypeLookupOptions> = async ({ options }) => {
  const extension = options?.extension?.trim();
  const mimeType = options?.mimeType?.trim();

  if (!extension && !mimeType) {
    throw new ProcessorError('missing_query', 'Enter a file extension or MIME type to look up.');
  }

  const entry = extension ? findByExtension(extension) : findByMimeType(mimeType ?? '');
  if (!entry) {
    throw new ProcessorError('not_found', `${extension ?? mimeType} is not a recognised entry.`);
  }

  const content = [
    `Extension: .${entry.extension}`,
    `MIME Type: ${entry.mimeType}`,
    `Description: ${entry.description}`,
    `Category: ${entry.category}`,
    `Standard: ${entry.standard}`,
    `Compressed: ${entry.compressed ? 'Yes' : 'No'}`,
    `Binary: ${entry.binary ? 'Yes' : 'No'}`,
    `Charset: ${entry.charset ?? 'Not Applicable'}`,
  ].join('\n');

  return {
    artifacts: [
      {
        file_name: `mime-${entry.extension}.txt`,
        mime_type: 'text/plain',
        blob: new Blob([content], { type: 'text/plain' }),
      },
    ],
    text: content,
  };
};

export default mimeTypeLookup;
