export interface Segment {
  /** Stable across edits so reorder state can survive a split or a merge elsewhere in the clip. */
  id: number;
  start: number;
  end: number;
  keep: boolean;
}

/** The shortest a segment (or the gap a drag leaves behind) is allowed to shrink to, in seconds. */
export const MIN_SEGMENT_SECONDS = 0.2;

let nextId = 1;

/** Resets the id counter. Test only — production never needs segment ids to restart at 1. */
export function resetSegmentIds(): void {
  nextId = 1;
}

export function initialSegments(duration: number): Segment[] {
  return [{ id: nextId++, start: 0, end: duration, keep: true }];
}

/** Splits whichever segment contains `time` into two. A no-op too close to an existing edge. */
export function splitAt(segments: readonly Segment[], time: number): Segment[] {
  const index = segments.findIndex(
    (segment) => time > segment.start + MIN_SEGMENT_SECONDS && time < segment.end - MIN_SEGMENT_SECONDS,
  );
  if (index === -1) return [...segments];
  const segment = segments[index];
  if (!segment) return [...segments];
  const left: Segment = { ...segment, end: time };
  const right: Segment = { ...segment, id: nextId++, start: time };
  return [...segments.slice(0, index), left, right, ...segments.slice(index + 1)];
}

/** Removes the boundary between segments[index] and the next one, merging them into one. */
export function mergeBoundary(segments: readonly Segment[], index: number): Segment[] {
  const left = segments[index];
  const right = segments[index + 1];
  if (!left || !right) return [...segments];
  const merged: Segment = { id: left.id, start: left.start, end: right.end, keep: left.keep };
  return [...segments.slice(0, index), merged, ...segments.slice(index + 2)];
}

/** Drags the boundary between segments[index] and the next one to `time`, clamped either side. */
export function moveBoundary(segments: readonly Segment[], index: number, time: number): Segment[] {
  const left = segments[index];
  const right = segments[index + 1];
  if (!left || !right) return [...segments];
  const clamped = Math.min(
    Math.max(time, left.start + MIN_SEGMENT_SECONDS),
    right.end - MIN_SEGMENT_SECONDS,
  );
  const next = [...segments];
  next[index] = { ...left, end: clamped };
  next[index + 1] = { ...right, start: clamped };
  return next;
}

export function toggleKeep(segments: readonly Segment[], id: number): Segment[] {
  return segments.map((segment) => (segment.id === id ? { ...segment, keep: !segment.keep } : segment));
}

/**
 * The output order for the kept segments. Preserves whatever a person already reordered by
 * hand; a segment that just became kept (a fresh split, or toggled back on) is appended at the
 * end rather than resetting the whole list back to timeline order.
 */
export function syncOrder(segments: readonly Segment[], order: readonly number[]): number[] {
  const keptIds = segments.filter((segment) => segment.keep).map((segment) => segment.id);
  const keptSet = new Set(keptIds);
  const preserved = order.filter((id) => keptSet.has(id));
  const preservedSet = new Set(preserved);
  const added = keptIds.filter((id) => !preservedSet.has(id));
  return [...preserved, ...added];
}

/** Swaps the segment at `index` with its neighbour in `direction`. Clamped at either end. */
export function moveOrder(order: readonly number[], index: number, direction: -1 | 1): number[] {
  const target = index + direction;
  if (target < 0 || target >= order.length) return [...order];
  const next = [...order];
  const a = next[index];
  const b = next[target];
  if (a === undefined || b === undefined) return next;
  next[index] = b;
  next[target] = a;
  return next;
}

/** Repeats the clip at `index` right after itself, so the same source range plays twice. */
export function duplicateOrder(order: readonly number[], index: number): number[] {
  const id = order[index];
  if (id === undefined) return [...order];
  return [...order.slice(0, index + 1), id, ...order.slice(index + 1)];
}

/**
 * Places `id` immediately after `afterId` in the output order (moving it there if it's already
 * present elsewhere). Used when a split creates a new sibling clip, so the new piece lands right
 * next to the clip it came from — wherever that clip currently sits in the play order — instead
 * of trailing the whole sequence the way a plain "just became kept" append would.
 */
export function insertAfter(order: readonly number[], afterId: number, id: number): number[] {
  const without = order.filter((entry) => entry !== id);
  const index = without.indexOf(afterId);
  if (index === -1) return [...without, id];
  return [...without.slice(0, index + 1), id, ...without.slice(index + 1)];
}

/**
 * Removes a segment from the timeline entirely, handing its time range to a neighbour rather
 * than leaving a gap. Unlike `toggleKeep`, the segment (and its id) is gone afterwards.
 */
export function removeSegment(segments: readonly Segment[], id: number): Segment[] {
  const index = segments.findIndex((segment) => segment.id === id);
  if (index === -1 || segments.length <= 1) return [...segments];
  const removed = segments[index]!;
  if (index > 0) {
    const prev = segments[index - 1]!;
    const merged: Segment = { ...prev, end: removed.end };
    return [...segments.slice(0, index - 1), merged, ...segments.slice(index + 1)];
  }
  const next = segments[index + 1]!;
  const merged: Segment = { ...next, start: removed.start };
  return [merged, ...segments.slice(index + 2)];
}

const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800];

/** Evenly spaced ruler marks for a timeline, rounded to a "nice" step (1s, 2s, 5s, 10s, ...). */
export function timeTicks(duration: number, targetCount = 6): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const rawStep = duration / Math.max(1, targetCount);
  const step = TICK_STEPS.find((candidate) => candidate >= rawStep) ?? TICK_STEPS[TICK_STEPS.length - 1]!;
  const ticks: number[] = [];
  for (let t = 0; t < duration; t += step) ticks.push(t);
  ticks.push(duration);
  return ticks;
}

export function formatOrderedSegments(
  segments: readonly Segment[],
  order: readonly number[],
): { start: number; end: number }[] {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  return order
    .map((id) => byId.get(id))
    .filter((segment): segment is Segment => segment !== undefined)
    .map(({ start, end }) => ({ start, end }));
}

export interface OrderedRange {
  start: number;
  end: number;
}

/**
 * The output-order index of whichever ordered clip currently contains `time` (start inclusive,
 * end exclusive); -1 if `time` falls in a cut, a gap, or past the end of the edit.
 */
export function orderedIndexAt(orderedSegments: readonly OrderedRange[], time: number): number {
  return orderedSegments.findIndex((segment) => time >= segment.start && time < segment.end);
}

/** The output-order index of the next kept clip that starts at or after `time`; -1 if none remain. */
export function nextOrderedIndexFrom(orderedSegments: readonly OrderedRange[], time: number): number {
  return orderedSegments.findIndex((segment) => segment.start >= time);
}

/** Moves the id at `from` to `to` within the output order, shifting everything between. */
export function reorderOutput(order: readonly number[], from: number, to: number): number[] {
  if (from === to || from < 0 || from >= order.length || to < 0 || to >= order.length) {
    return [...order];
  }
  const next = [...order];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...order];
  next.splice(to, 0, moved);
  return next;
}

/**
 * Converts a position along the played-back edit (0 at the very first frame of the output, up to
 * the edit's total kept duration) to the matching source time. This is what makes the output
 * sequence — the row a clip actually moves in when it's dragged to reorder — playable and
 * scrubbable on its own timeline, independent of where each clip originally sat in the source.
 */
export function sequenceToSource(orderedSegments: readonly OrderedRange[], sequenceTime: number): number {
  let offset = 0;
  for (let i = 0; i < orderedSegments.length; i += 1) {
    const segment = orderedSegments[i]!;
    const length = segment.end - segment.start;
    const isLast = i === orderedSegments.length - 1;
    if (sequenceTime < offset + length || isLast) {
      return segment.start + Math.min(Math.max(sequenceTime - offset, 0), length);
    }
    offset += length;
  }
  return 0;
}

/** The inverse of `sequenceToSource`: where `sourceTime` lands on the output sequence, or null
 *  when that source time isn't part of the output (it's cut, or belongs to no kept clip). */
export function sourceToSequence(orderedSegments: readonly OrderedRange[], sourceTime: number): number | null {
  let offset = 0;
  for (const segment of orderedSegments) {
    if (sourceTime >= segment.start && sourceTime < segment.end) return offset + (sourceTime - segment.start);
    offset += segment.end - segment.start;
  }
  return null;
}
