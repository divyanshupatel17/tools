import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import {
  generateRecords,
  toCsv,
  type CsvDelimiter,
  type CustomField,
  type FieldKey,
  type OutputFormat,
} from './data_gen';

export interface RandomDataGeneratorOptions {
  fields?: FieldKey[];
  customFields?: CustomField[];
  count?: number;
  format?: OutputFormat;
  delimiter?: CsvDelimiter;
  minifyJson?: boolean;
}

const MIN_COUNT = 1;
const MAX_COUNT = 10000;

const randomDataGenerator: ToolProcessor<RandomDataGeneratorOptions> = async ({ options }) => {
  const fields = options?.fields ?? [];
  const customFields = (options?.customFields ?? []).filter((field) => field.name.trim() !== '');
  const count = options?.count ?? 10;
  const format = options?.format ?? 'json';

  if (fields.length === 0 && customFields.length === 0) {
    throw new ProcessorError('no_fields', 'Select at least one field to generate.');
  }
  if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
    throw new ProcessorError('invalid_count', `Number of records must be between ${MIN_COUNT} and ${MAX_COUNT}.`);
  }

  const records = generateRecords({ fields, customFields, count });
  const content =
    format === 'csv'
      ? toCsv(records, options?.delimiter ?? ',')
      : JSON.stringify(records, null, options?.minifyJson ? 0 : 2);
  const fileName = format === 'csv' ? 'random-data.csv' : 'random-data.json';
  const mimeType = format === 'csv' ? 'text/csv' : 'application/json';

  return {
    artifacts: [{ file_name: fileName, mime_type: mimeType, blob: new Blob([content], { type: mimeType }) }],
    text: content,
  };
};

export default randomDataGenerator;
