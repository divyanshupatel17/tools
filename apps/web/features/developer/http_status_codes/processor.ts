import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { CLASS_LABELS, findStatusCode } from './status_codes';

export interface HttpStatusCodesOptions {
  code?: number;
}

const httpStatusCodes: ToolProcessor<HttpStatusCodesOptions> = async ({ options }) => {
  const code = options?.code;
  if (!Number.isInteger(code)) {
    throw new ProcessorError('missing_code', 'Enter an HTTP status code to look up.');
  }

  const entry = findStatusCode(code as number);
  if (!entry) {
    throw new ProcessorError('unknown_code', `${code} is not a registered HTTP status code.`);
  }

  const content = [
    `${entry.code} ${entry.name}`,
    `Category: ${entry.statusClass} ${CLASS_LABELS[entry.statusClass]}`,
    '',
    entry.description,
    '',
    `Common use: ${entry.commonUse}`,
    '',
    `Reference: ${entry.rfc}`,
    entry.rfcUrl,
  ].join('\n');

  return {
    artifacts: [
      {
        file_name: `status-${entry.code}.txt`,
        mime_type: 'text/plain',
        blob: new Blob([content], { type: 'text/plain' }),
      },
    ],
    text: content,
  };
};

export default httpStatusCodes;
