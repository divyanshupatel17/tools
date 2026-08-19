export type JsonIndent = '2' | '4' | 'tab' | 'minified';

export interface JsonFormatOptions {
  indent: JsonIndent;
  sortKeys: boolean;
}

export const DEFAULT_JSON_FORMAT_OPTIONS: JsonFormatOptions = {
  indent: '2',
  sortKeys: false,
};

export interface JsonParseError {
  message: string;
  line: number;
  column: number;
  index: number;
}

export interface JsonParseSuccess {
  valid: true;
  value: unknown;
  error?: undefined;
}

export interface JsonParseFailure {
  valid: false;
  value?: undefined;
  error: JsonParseError;
}

export type JsonParseResult = JsonParseSuccess | JsonParseFailure;

function lineColFromIndex(text: string, index: number): { line: number; column: number } {
  const upTo = text.slice(0, Math.max(0, index));
  const lines = upTo.split('\n');
  return { line: lines.length, column: (lines[lines.length - 1] ?? '').length + 1 };
}

/** V8's SyntaxError messages end with "...at position N" — the only place the failing
 * offset appears, since JSON.parse itself throws no structured location. */
function indexFromMessage(message: string, source: string): number {
  const match = /position (\d+)/.exec(message);
  if (match) return Number(match[1]);
  const lineMatch = /line (\d+) column (\d+)/.exec(message);
  if (lineMatch) {
    const lines = source.split('\n');
    let index = 0;
    for (let i = 0; i < Number(lineMatch[1]) - 1; i += 1) index += (lines[i]?.length ?? 0) + 1;
    return index + Number(lineMatch[2]) - 1;
  }
  return 0;
}

export function parseJson(source: string): JsonParseResult {
  if (source.trim() === '') {
    return { valid: false, error: { message: 'Enter some JSON to validate.', line: 1, column: 1, index: 0 } };
  }
  try {
    return { valid: true, value: JSON.parse(source) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.';
    const index = indexFromMessage(message, source);
    const { line, column } = lineColFromIndex(source, index);
    return { valid: false, error: { message, line, column, index } };
  }
}

function sortObjectKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeysDeep);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, val]) => [key, sortObjectKeysDeep(val)]));
  }
  return value;
}

export function stringifyJson(value: unknown, options: JsonFormatOptions): string {
  const ordered = options.sortKeys ? sortObjectKeysDeep(value) : value;
  const indent = options.indent === '2' ? 2 : options.indent === '4' ? 4 : options.indent === 'tab' ? '\t' : 0;
  return JSON.stringify(ordered, null, indent);
}

export type JsonNodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export function jsonNodeType(value: unknown): JsonNodeType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  return 'boolean';
}

export function jsonChildCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') return Object.keys(value as object).length;
  return 0;
}
