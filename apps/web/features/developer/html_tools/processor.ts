import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { runHtmlOperation, type HtmlOperation } from './html_ops';

export interface HtmlToolsOptions {
  operation: HtmlOperation;
}

const FILE_NAME: Record<HtmlOperation, string> = {
  encode: 'encoded.html',
  decode: 'decoded.txt',
  escape: 'escaped.html',
  unescape: 'unescaped.txt',
  minify: 'minified.html',
  beautify: 'beautified.html',
  strip: 'stripped.txt',
};

const htmlToolsProcessor: ToolProcessor<HtmlToolsOptions> = async ({ text, options }, { on_progress }) => {
  on_progress?.({ ratio: 0, label: 'Processing' });
  const source = text ?? '';
  if (source.trim() === '') {
    throw new ProcessorError('empty_input', 'There is nothing to process yet.');
  }

  const operation = options?.operation ?? 'encode';
  const result = await runHtmlOperation(operation, source);
  if (!result.ok) {
    throw new ProcessorError('invalid_html', result.message);
  }
  on_progress?.({ ratio: 1, label: 'Done' });

  const fileName = FILE_NAME[operation];
  const mimeType = fileName.endsWith('.html') ? 'text/html' : 'text/plain';
  return {
    artifacts: [{ file_name: fileName, mime_type: mimeType, blob: new Blob([result.text], { type: mimeType }) }],
    text: result.text,
  };
};

export default htmlToolsProcessor;
