/** Formats 0-based indices into a compact 1-based range string, e.g. "1, 3, 5-7". */
export function formatPageRanges(indices: readonly number[]): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  const parts: string[] = [];
  let start = sorted[0]!;
  let prev = sorted[0]!;

  for (let i = 1; i <= sorted.length; i += 1) {
    const current = sorted[i];
    if (current !== undefined && current === prev + 1) {
      prev = current;
      continue;
    }
    parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
    if (current !== undefined) {
      start = current;
      prev = current;
    }
  }

  return parts.join(', ');
}

/**
 * Parses "1-3, 5, 7-9" into 0-based page indices. Tolerant of partial or invalid tokens
 * (e.g. while the user is still typing "7-"), which it silently skips rather than throwing.
 */
export function parsePageRanges(text: string, pageCount: number): Set<number> {
  const result = new Set<number>();
  for (const raw of text.split(',')) {
    const chunk = raw.trim();
    if (chunk.length === 0) continue;

    const match = /^(\d+)(?:-(\d+))?$/.exec(chunk);
    if (!match) continue;

    const start = Number(match[1]) - 1;
    const end = match[2] !== undefined ? Number(match[2]) - 1 : start;
    if (start < 0 || end < start) continue;

    for (let index = Math.max(start, 0); index <= Math.min(end, pageCount - 1); index += 1) {
      result.add(index);
    }
  }
  return result;
}
