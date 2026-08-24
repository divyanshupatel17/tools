export type LineNumberFormat = 'plain' | 'dot' | 'paren' | 'padded';
export type FilterMode = 'all' | 'keep_contains' | 'remove_contains' | 'keep_regex';

export interface LineEditorOptions {
  add_prefix?: boolean;
  prefix?: string;
  add_suffix?: boolean;
  suffix?: string;
  add_line_numbers?: boolean;
  start_from?: number;
  number_format?: LineNumberFormat;
  filter_mode?: FilterMode;
  filter_text?: string;
  filter_regex?: string;
}

export interface LineNumberFormatInfo {
  id: LineNumberFormat;
  label: string;
}

export const LINE_NUMBER_FORMATS: readonly LineNumberFormatInfo[] = [
  { id: 'plain', label: '1, 2, 3, …' },
  { id: 'dot', label: '1. 2. 3. …' },
  { id: 'paren', label: '1) 2) 3) …' },
  { id: 'padded', label: '01, 02, 03, …' },
];

function formatLineNumber(value: number, format: LineNumberFormat, width: number): string {
  switch (format) {
    case 'plain':
      return `${value}`;
    case 'dot':
      return `${value}.`;
    case 'paren':
      return `${value})`;
    case 'padded':
      return String(value).padStart(width, '0');
  }
}

function filterLines(lines: readonly string[], options: LineEditorOptions): string[] {
  const mode = options.filter_mode ?? 'all';

  if (mode === 'keep_contains') {
    const needle = options.filter_text ?? '';
    return needle === '' ? [...lines] : lines.filter((line) => line.includes(needle));
  }
  if (mode === 'remove_contains') {
    const needle = options.filter_text ?? '';
    return needle === '' ? [...lines] : lines.filter((line) => !line.includes(needle));
  }
  if (mode === 'keep_regex') {
    const pattern = options.filter_regex ?? '';
    if (pattern === '') return [...lines];
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      throw new Error('That regular expression is not valid.');
    }
    return lines.filter((line) => regex.test(line));
  }
  return [...lines];
}

/** Filters first, then numbers whatever survives — numbering counts kept lines, not their
 * original position in the source. */
export function editLines(text: string, options: LineEditorOptions): string {
  const filtered = filterLines(text.split('\n'), options);
  const format = options.number_format ?? 'plain';
  const start = options.start_from ?? 1;
  const width = String(start + filtered.length - 1).length;

  return filtered
    .map((line, index) => {
      let result = line;
      if (options.add_prefix && options.prefix) result = options.prefix + result;
      if (options.add_suffix && options.suffix) result = result + options.suffix;
      if (options.add_line_numbers) {
        result = `${formatLineNumber(start + index, format, width)} ${result}`;
      }
      return result;
    })
    .join('\n');
}
