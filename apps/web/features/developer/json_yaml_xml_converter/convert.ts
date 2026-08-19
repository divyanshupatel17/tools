export type DataFormat = 'json' | 'yaml' | 'xml';

export const DATA_FORMATS: DataFormat[] = ['json', 'yaml', 'xml'];

export const FORMAT_LABEL: Record<DataFormat, string> = {
  json: 'JSON',
  yaml: 'YAML',
  xml: 'XML',
};

export const FORMAT_EXTENSION: Record<DataFormat, string> = {
  json: 'json',
  yaml: 'yaml',
  xml: 'xml',
};

const XML_ROOT_TAG = 'root';

export interface ConvertSuccess {
  ok: true;
  text: string;
}

export interface ConvertFailure {
  ok: false;
  message: string;
}

export type ConvertResult = ConvertSuccess | ConvertFailure;

/** A crude but reliable signal: XML always opens with `<`, YAML almost never does. */
export function detectFormat(source: string): DataFormat | null {
  const trimmed = source.trim();
  if (trimmed === '') return null;
  if (trimmed.startsWith('<')) return 'xml';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  try {
    JSON.parse(trimmed);
    return 'json';
  } catch {
    // Not JSON; fall through to YAML, which is the remaining option since XML was ruled out above.
  }
  return 'yaml';
}

async function parseSource(source: string, format: DataFormat): Promise<unknown> {
  if (format === 'json') return JSON.parse(source);
  if (format === 'yaml') {
    const { parse } = await import('yaml');
    return parse(source);
  }
  const { XMLParser } = await import('fast-xml-parser');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    textNodeName: '#text',
    parseTagValue: true,
    trimValues: true,
    ignoreDeclaration: true,
    htmlEntities: true,
  });
  const parsed: unknown = parser.parse(source);
  if (parsed && typeof parsed === 'object') {
    const keys = Object.keys(parsed as Record<string, unknown>);
    if (keys.length === 1 && keys[0] === XML_ROOT_TAG) {
      return (parsed as Record<string, unknown>)[XML_ROOT_TAG];
    }
  }
  return parsed;
}

async function stringifyTo(value: unknown, format: DataFormat): Promise<string> {
  if (format === 'json') return JSON.stringify(value, null, 2);
  if (format === 'yaml') {
    const { stringify } = await import('yaml');
    return stringify(value);
  }
  const { XMLBuilder } = await import('fast-xml-parser');
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    textNodeName: '#text',
    format: true,
    indentBy: '  ',
  });
  // XML allows exactly one root element, but a JS value can be an object, an array, or a
  // primitive. Objects become the root's children directly; arrays and primitives are wrapped
  // so the builder never has to emit multiple sibling root tags, which is not well formed XML.
  const wrapped = Array.isArray(value)
    ? { [XML_ROOT_TAG]: { item: value } }
    : { [XML_ROOT_TAG]: value };
  const body = builder.build(wrapped);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

export async function convert(
  source: string,
  from: DataFormat,
  to: DataFormat,
): Promise<ConvertResult> {
  try {
    const value = await parseSource(source, from);
    const text = await stringifyTo(value, to);
    return { ok: true, text };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : `That input is not valid ${FORMAT_LABEL[from]}.`,
    };
  }
}
