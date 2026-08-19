import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { generateLorem, toHtml, type LoremStart, type LoremType } from './lorem_ipsum';

export interface LoremIpsumGeneratorOptions {
  type?: LoremType;
  count?: number;
  wordsPerParagraph?: number;
  start?: LoremStart;
  includeHtml?: boolean;
}

const MIN_COUNT = 1;
const MAX_COUNT = 500;

const loremIpsumGenerator: ToolProcessor<LoremIpsumGeneratorOptions> = async ({ options }) => {
  const type = options?.type ?? 'paragraphs';
  const count = options?.count ?? 3;
  const wordsPerParagraph = options?.wordsPerParagraph ?? 20;
  const start = options?.start ?? 'lorem-ipsum';
  const includeHtml = options?.includeHtml ?? false;

  if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
    throw new ProcessorError('invalid_count', `Count must be between ${MIN_COUNT} and ${MAX_COUNT}.`);
  }

  const result = generateLorem({ type, count, wordsPerParagraph, start });
  const content = includeHtml ? toHtml(result.paragraphs) : result.text;
  const fileName = includeHtml ? 'lorem-ipsum.html' : 'lorem-ipsum.txt';
  const mimeType = includeHtml ? 'text/html' : 'text/plain';

  return {
    artifacts: [{ file_name: fileName, mime_type: mimeType, blob: new Blob([content], { type: mimeType }) }],
    text: content,
  };
};

export default loremIpsumGenerator;
