import type { ToolProcessor } from '@tools/tool_engine';
import { ProcessorError } from '@tools/tool_engine';
import { buildQueryString, jsonToParams, parseQueryString, paramsToJson } from './query_string_ops';

export interface UrlQueryStringOptions {
  mode?: 'query-to-json' | 'json-to-query';
}

const urlQueryString: ToolProcessor<UrlQueryStringOptions> = async ({ text, options }) => {
  const input = text ?? '';
  const mode = options?.mode ?? 'query-to-json';

  if (input.trim() === '') {
    throw new ProcessorError('empty_input', 'There is nothing to convert yet.');
  }

  if (mode === 'query-to-json') {
    const params = parseQueryString(input);
    const content = JSON.stringify(paramsToJson(params), null, 2);
    return {
      artifacts: [
        { file_name: 'query-params.json', mime_type: 'application/json', blob: new Blob([content], { type: 'application/json' }) },
      ],
      text: content,
    };
  }

  const result = jsonToParams(input);
  if (!result.ok) {
    throw new ProcessorError('invalid_json', result.message ?? 'That is not valid JSON.');
  }
  const content = buildQueryString(result.params);
  return {
    artifacts: [
      { file_name: 'query-string.txt', mime_type: 'text/plain', blob: new Blob([content], { type: 'text/plain' }) },
    ],
    text: content,
  };
};

export default urlQueryString;
