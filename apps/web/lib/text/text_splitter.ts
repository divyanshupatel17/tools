export type SplitDelimiterId = 'newline' | 'comma' | 'space' | 'custom';
export type TextSplitterOperation = 'split' | 'join';

export interface SplitDelimiterInfo {
  id: SplitDelimiterId;
  label: string;
}

export const SPLIT_DELIMITERS: readonly SplitDelimiterInfo[] = [
  { id: 'newline', label: 'New Line (Enter)' },
  { id: 'comma', label: 'Comma (,)' },
  { id: 'space', label: 'Space' },
  { id: 'custom', label: 'Custom' },
];

export interface SplitJoinOptions {
  split_delimiter?: SplitDelimiterId;
  custom_split_delimiter?: string;
  join_delimiter?: string;
  remove_empty?: boolean;
  trim_whitespace?: boolean;
}

function resolveSplitDelimiter(options: SplitJoinOptions): string {
  switch (options.split_delimiter ?? 'newline') {
    case 'newline':
      return '\n';
    case 'comma':
      return ',';
    case 'space':
      return ' ';
    case 'custom':
      return options.custom_split_delimiter ?? '';
  }
}

function applyListOptions(items: readonly string[], options: SplitJoinOptions): string[] {
  let list = [...items];
  if (options.trim_whitespace ?? true) list = list.map((item) => item.trim());
  if (options.remove_empty ?? true) list = list.filter((item) => item !== '');
  return list;
}

/** An empty delimiter (no custom delimiter typed yet) leaves the text as one single item,
 * rather than splitting on every character. */
export function splitText(text: string, options: SplitJoinOptions): string[] {
  const delimiter = resolveSplitDelimiter(options);
  const items = delimiter === '' ? [text] : text.split(delimiter);
  return applyListOptions(items, options);
}

/** Join mode's input is one item per line, regardless of whatever Split's own delimiter is
 * set to — the two operations don't share that setting. */
export function joinLines(text: string, options: SplitJoinOptions): string {
  return joinItems(text.split('\n'), options);
}

export function joinItems(items: readonly string[], options: SplitJoinOptions): string {
  return applyListOptions(items, options).join(options.join_delimiter ?? '');
}
