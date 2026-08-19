export type MatchType = 'exact' | 'case_insensitive';
export type KeepOccurrence = 'first' | 'last';

export interface DuplicateOptions {
  match_type?: MatchType;
  keep_occurrence?: KeepOccurrence;
  ignore_spaces?: boolean;
  ignore_empty_lines?: boolean;
}

export interface DuplicateLineInfo {
  text: string;
  isDuplicate: boolean;
}

export interface DuplicateSummary {
  duplicateLines: number;
  uniqueLines: number;
}

function normalizeKey(line: string, options: DuplicateOptions): string {
  let key = line;
  if (options.ignore_spaces ?? false) key = key.trim();
  if (options.match_type === 'case_insensitive') key = key.toLowerCase();
  return key;
}

/** Marks every line as a duplicate or not, keeping the original order and count intact — for
 * highlighting duplicates in place, not removing them. An empty line, when Ignore Empty Lines
 * is on, is never compared against anything, including other empty lines. */
export function markDuplicates(text: string, options: DuplicateOptions = {}): DuplicateLineInfo[] {
  const lines = text === '' ? [] : text.split('\n');
  const ignoreEmpty = options.ignore_empty_lines ?? false;
  const keepFirst = (options.keep_occurrence ?? 'first') === 'first';

  const keys = lines.map((line) => (ignoreEmpty && line.trim() === '' ? null : normalizeKey(line, options)));

  const counts = new Map<string, number>();
  for (const key of keys) if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1);

  // Whichever occurrence should survive is visited first in this order, so it's the one that
  // reads as "already seen" once for its key — everything visited afterwards is the duplicate.
  const order = keepFirst
    ? lines.map((_, index) => index)
    : lines.map((_, index) => index).reverse();

  const seenCount = new Map<string, number>();
  const isDuplicateAt = new Array<boolean>(lines.length).fill(false);
  for (const index of order) {
    const key = keys[index];
    if (key == null) continue;
    const seen = (seenCount.get(key) ?? 0) + 1;
    seenCount.set(key, seen);
    if ((counts.get(key) ?? 0) > 1 && seen > 1) isDuplicateAt[index] = true;
  }

  return lines.map((line, index) => ({ text: line, isDuplicate: isDuplicateAt[index] ?? false }));
}

export function removeDuplicates(text: string, options: DuplicateOptions = {}): string[] {
  return markDuplicates(text, options)
    .filter((line) => !line.isDuplicate)
    .map((line) => line.text);
}

export function summarizeDuplicates(marked: readonly DuplicateLineInfo[]): DuplicateSummary {
  const duplicateLines = marked.filter((line) => line.isDuplicate).length;
  return { duplicateLines, uniqueLines: marked.length - duplicateLines };
}
