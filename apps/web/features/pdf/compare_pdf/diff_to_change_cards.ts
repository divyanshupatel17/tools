import type { DiffLine } from '@/lib/pdf/text_diff';

export interface ChangeCard {
  id: string;
  oldLines: string[];
  newLines: string[];
}

/**
 * Turns a page's line-level diff into review style change cards: a run of consecutive
 * `removed` lines becomes the card's old block, a run of consecutive `added` lines becomes
 * its new block, and the two are paired into one card. `equal` lines are context, not a
 * change, so they only act as a separator between cards rather than appearing in one.
 */
export function groupDiffIntoChangeCards(diff: readonly DiffLine[]): ChangeCard[] {
  const cards: ChangeCard[] = [];
  let oldLines: string[] = [];
  let newLines: string[] = [];

  function flush() {
    if (oldLines.length === 0 && newLines.length === 0) return;
    cards.push({ id: `${cards.length}`, oldLines, newLines });
    oldLines = [];
    newLines = [];
  }

  for (const line of diff) {
    if (line.type === 'equal') {
      flush();
    } else if (line.type === 'removed') {
      oldLines.push(line.text);
    } else {
      newLines.push(line.text);
    }
  }
  flush();

  return cards;
}
