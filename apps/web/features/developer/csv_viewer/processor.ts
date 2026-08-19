import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { csvToJson, csvToXml, parseCsv, stringifyCsv } from './csv';

export type CsvOutputFormat = 'json' | 'csv' | 'xml';

export interface CsvViewerOptions {
  to: CsvOutputFormat;
}

const MIME_TYPE: Record<CsvOutputFormat, string> = {
  json: 'application/json',
  csv: 'text/csv',
  xml: 'application/xml',
};

const csvViewerConverter: ToolProcessor<CsvViewerOptions> = async ({ text, options }, { on_progress }) => {
  on_progress?.({ ratio: 0, label: 'Converting' });
  const parsed = parseCsv(text ?? '');
  if (!parsed.ok) {
    throw new ProcessorError('invalid_csv', parsed.message);
  }

  const to = options?.to ?? 'json';
  const output =
    to === 'json' ? csvToJson(parsed.table) : to === 'csv' ? stringifyCsv(parsed.table) : await csvToXml(parsed.table);
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: `data.${to}`,
        mime_type: MIME_TYPE[to],
        blob: new Blob([output], { type: MIME_TYPE[to] }),
      },
    ],
    text: output,
  };
};

export default csvViewerConverter;
