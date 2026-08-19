export interface DiffOptions {
  ignore_case: boolean;
  ignore_whitespace: boolean;
  /** Blank (whitespace only) lines are excluded from the comparison entirely, on both sides,
   * rather than being reported as additions or removals. Optional so existing callers that
   * predate this option keep compiling and behaving exactly as before. */
  ignore_empty_lines?: boolean;
}

export type DiffLineType = 'equal' | 'added' | 'removed' | 'modified';

export interface DiffSideBySideRow {
  type: DiffLineType;
  left: { number: number; text: string } | null;
  right: { number: number; text: string } | null;
}

export interface DiffUnifiedLine {
  type: 'equal' | 'added' | 'removed';
  left_number: number | null;
  right_number: number | null;
  text: string;
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}

export interface DiffResult {
  side_by_side: DiffSideBySideRow[];
  unified: DiffUnifiedLine[];
  summary: DiffSummary;
  /** True when either side had more lines than the diff engine will compare; the result covers
   * only the first `MAX_DIFF_LINES` lines of each side so the DP table stays a bounded size. */
  truncated: boolean;
}

/** Line cap per side. Bounds the O(n*m) comparison table to a size that stays fast and light
 * in a browser tab; a paste box this large is already far past what a person reviews by eye. */
export const MAX_DIFF_LINES = 1500;

function splitLines(text: string): string[] {
  return text === '' ? [] : text.split('\n');
}

function normalize(line: string, options: DiffOptions): string {
  let value = line;
  if (options.ignore_whitespace) value = value.trim().replace(/\s+/g, ' ');
  if (options.ignore_case) value = value.toLowerCase();
  return value;
}

/** One line paired with its 0 based position in the original (untruncated-per-side, unfiltered)
 * line array, so displayed line numbers stay correct even when `ignore_empty_lines` removes
 * some entries from comparison before diffing. */
interface DiffEntry {
  originalIndex: number;
  line: string;
}

type RawOp =
  | { type: 'equal'; aIndex: number; bIndex: number }
  | { type: 'delete'; aIndex: number }
  | { type: 'insert'; bIndex: number };

/**
 * Line level LCS diff (classic O(n·m) dynamic program), the same approach as
 * `lib/pdf/text_diff.ts`'s `diffLines` — easier to verify correct than Myers' O(ND) for a tool
 * whose whole job is telling two texts apart accurately, and paste boxes stay small enough in
 * practice that the quadratic table is not a real cost once capped by `MAX_DIFF_LINES`.
 */
function diffOps(keysA: readonly string[], keysB: readonly string[]): RawOp[] {
  const n = keysA.length;
  const m = keysB.length;
  const lengths: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        keysA[i] === keysB[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  const ops: RawOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (keysA[i] === keysB[j]) {
      ops.push({ type: 'equal', aIndex: i, bIndex: j });
      i += 1;
      j += 1;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      ops.push({ type: 'delete', aIndex: i });
      i += 1;
    } else {
      ops.push({ type: 'insert', bIndex: j });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: 'delete', aIndex: i });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: 'insert', bIndex: j });
    j += 1;
  }
  return ops;
}

function buildUnified(
  ops: readonly RawOp[],
  a: readonly DiffEntry[],
  b: readonly DiffEntry[],
): DiffUnifiedLine[] {
  const lines: DiffUnifiedLine[] = [];
  for (const op of ops) {
    if (op.type === 'equal') {
      const left = a[op.aIndex]!;
      const right = b[op.bIndex]!;
      lines.push({
        type: 'equal',
        left_number: left.originalIndex + 1,
        right_number: right.originalIndex + 1,
        text: left.line,
      });
    } else if (op.type === 'delete') {
      const left = a[op.aIndex]!;
      lines.push({ type: 'removed', left_number: left.originalIndex + 1, right_number: null, text: left.line });
    } else {
      const right = b[op.bIndex]!;
      lines.push({ type: 'added', left_number: null, right_number: right.originalIndex + 1, text: right.line });
    }
  }
  return lines;
}

/**
 * Pairs a run of consecutive removed lines with the run of added lines that immediately follows
 * it into "modified" rows (one old line beside one new line, highlighted as changed rather than
 * as an unrelated removal plus an unrelated addition) — the side by side view a diff reviewer
 * expects. Any leftover lines once the shorter run is exhausted stay pure removed or added.
 */
function buildSideBySide(
  ops: readonly RawOp[],
  a: readonly DiffEntry[],
  b: readonly DiffEntry[],
): DiffSideBySideRow[] {
  const rows: DiffSideBySideRow[] = [];
  let index = 0;

  while (index < ops.length) {
    const op = ops[index]!;
    if (op.type === 'equal') {
      const left = a[op.aIndex]!;
      const right = b[op.bIndex]!;
      rows.push({
        type: 'equal',
        left: { number: left.originalIndex + 1, text: left.line },
        right: { number: right.originalIndex + 1, text: right.line },
      });
      index += 1;
      continue;
    }

    const deletes: number[] = [];
    const inserts: number[] = [];
    while (index < ops.length && ops[index]!.type !== 'equal') {
      const run = ops[index]!;
      if (run.type === 'delete') deletes.push(run.aIndex);
      else if (run.type === 'insert') inserts.push(run.bIndex);
      index += 1;
    }

    const pairCount = Math.min(deletes.length, inserts.length);
    for (let k = 0; k < pairCount; k += 1) {
      const left = a[deletes[k]!]!;
      const right = b[inserts[k]!]!;
      rows.push({
        type: 'modified',
        left: { number: left.originalIndex + 1, text: left.line },
        right: { number: right.originalIndex + 1, text: right.line },
      });
    }
    for (let k = pairCount; k < deletes.length; k += 1) {
      const left = a[deletes[k]!]!;
      rows.push({ type: 'removed', left: { number: left.originalIndex + 1, text: left.line }, right: null });
    }
    for (let k = pairCount; k < inserts.length; k += 1) {
      const right = b[inserts[k]!]!;
      rows.push({ type: 'added', left: null, right: { number: right.originalIndex + 1, text: right.line } });
    }
  }

  return rows;
}

export function computeDiff(original: string, modified: string, options: DiffOptions): DiffResult {
  const fullA = splitLines(original);
  const fullB = splitLines(modified);
  const truncated = fullA.length > MAX_DIFF_LINES || fullB.length > MAX_DIFF_LINES;
  const cappedA = truncated ? fullA.slice(0, MAX_DIFF_LINES) : fullA;
  const cappedB = truncated ? fullB.slice(0, MAX_DIFF_LINES) : fullB;

  const toEntries = (lines: readonly string[]): DiffEntry[] =>
    lines
      .map((line, originalIndex) => ({ originalIndex, line }))
      .filter((entry) => !options.ignore_empty_lines || entry.line.trim() !== '');

  const a = toEntries(cappedA);
  const b = toEntries(cappedB);

  const keysA = a.map((entry) => normalize(entry.line, options));
  const keysB = b.map((entry) => normalize(entry.line, options));
  const ops = diffOps(keysA, keysB);

  const side_by_side = buildSideBySide(ops, a, b);
  const unified = buildUnified(ops, a, b);

  const summary: DiffSummary = { added: 0, removed: 0, modified: 0, unchanged: 0 };
  for (const row of side_by_side) {
    if (row.type === 'added') summary.added += 1;
    else if (row.type === 'removed') summary.removed += 1;
    else if (row.type === 'modified') summary.modified += 1;
    else summary.unchanged += 1;
  }

  return { side_by_side, unified, summary, truncated };
}

/** Renders the result as a classic unified `.diff`, the same `-`/`+`/space convention every
 * commit viewer uses, for the tool's downloadable export. */
export function formatUnifiedDiff(result: DiffResult, leftLabel: string, rightLabel: string): string {
  const lines = [`--- ${leftLabel}`, `+++ ${rightLabel}`];
  for (const line of result.unified) {
    const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
    lines.push(`${prefix}${line.text}`);
  }
  return lines.join('\n');
}
