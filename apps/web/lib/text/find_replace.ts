export interface FindReplaceOptions {
  case_sensitive?: boolean;
  whole_word?: boolean;
  regex?: boolean;
}

export interface FindReplaceMatch {
  index: number;
  length: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Throws a message fit to show the user directly when Regular expression is on and invalid. */
export function buildFindPattern(find: string, options: FindReplaceOptions): RegExp {
  const flags = options.case_sensitive ? 'g' : 'gi';
  if (options.regex) {
    try {
      return new RegExp(find, flags);
    } catch {
      throw new Error('That regular expression is not valid.');
    }
  }
  const escaped = escapeRegExp(find);
  const source = options.whole_word ? `\\b${escaped}\\b` : escaped;
  return new RegExp(source, flags);
}

export function findMatches(
  text: string,
  find: string,
  options: FindReplaceOptions = {},
): FindReplaceMatch[] {
  if (find === '') return [];
  const pattern = buildFindPattern(find, options);
  const matches: FindReplaceMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    matches.push({ index: match.index, length: match[0].length });
    // A pattern that can match empty (e.g. "a*") would loop forever: exec() never advances
    // lastIndex on its own for a zero length match.
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  return matches;
}

export function replaceAll(
  text: string,
  find: string,
  replacement: string,
  options: FindReplaceOptions = {},
): string {
  const matches = findMatches(text, find, options);
  if (matches.length === 0) return text;
  let result = '';
  let cursor = 0;
  for (const match of matches) {
    result += text.slice(cursor, match.index) + replacement;
    cursor = match.index + match.length;
  }
  return result + text.slice(cursor);
}

/** Replaces the first match at or after `fromIndex`, wrapping to the start if every match is
 * before it — mirrors what "Find Next" already selected. */
export function replaceOne(
  text: string,
  find: string,
  replacement: string,
  options: FindReplaceOptions = {},
  fromIndex = 0,
): { text: string; replacedAt: number | null } {
  const matches = findMatches(text, find, options);
  if (matches.length === 0) return { text, replacedAt: null };
  const match = matches.find((entry) => entry.index >= fromIndex) ?? matches[0]!;
  const next = text.slice(0, match.index) + replacement + text.slice(match.index + match.length);
  return { text: next, replacedAt: match.index };
}
