export interface DiffLine {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

/**
 * Line-level LCS diff (classic O(n·m) dynamic program). Pages are short enough in practice —
 * a few hundred lines at most — that the quadratic table is not worth trading for Myers'
 * O(ND); the DP is easier to verify correct, which matters more for a tool whose whole job is
 * telling two documents apart accurately.
 */
export function diffLines(before: readonly string[], after: readonly string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;
  const lengths: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        before[i] === after[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      result.push({ type: 'equal', text: before[i]! });
      i += 1;
      j += 1;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      result.push({ type: 'removed', text: before[i]! });
      i += 1;
    } else {
      result.push({ type: 'added', text: after[j]! });
      j += 1;
    }
  }
  while (i < n) {
    result.push({ type: 'removed', text: before[i]! });
    i += 1;
  }
  while (j < m) {
    result.push({ type: 'added', text: after[j]! });
    j += 1;
  }

  return result;
}

export interface PageDiffSummary {
  pageIndex: number;
  linesAdded: number;
  linesRemoved: number;
  changed: boolean;
  diff: DiffLine[];
}

/** Compares two documents' text page-by-page, aligned by index. A page present in only one
 * document diffs against an empty page (every line shows as fully added or fully removed)
 * rather than being skipped, so an inserted or deleted page is still visible in the report. */
export function diffPages(
  before: readonly string[][],
  after: readonly string[][],
): PageDiffSummary[] {
  const pageCount = Math.max(before.length, after.length);
  const summaries: PageDiffSummary[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    const diff = diffLines(before[index] ?? [], after[index] ?? []);
    const linesAdded = diff.filter((line) => line.type === 'added').length;
    const linesRemoved = diff.filter((line) => line.type === 'removed').length;
    summaries.push({
      pageIndex: index,
      linesAdded,
      linesRemoved,
      changed: linesAdded > 0 || linesRemoved > 0,
      diff,
    });
  }

  return summaries;
}
