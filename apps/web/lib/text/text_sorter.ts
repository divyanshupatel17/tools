export type SortMode = 'az' | 'za' | 'numeric' | 'natural' | 'shuffle' | 'dedupe';

export interface SortOption {
  id: SortMode;
  label: string;
  description: string;
}

export const SORT_OPTIONS: readonly SortOption[] = [
  { id: 'az', label: 'Sort A → Z', description: 'Sort lines alphabetically (A to Z).' },
  { id: 'za', label: 'Sort Z → A', description: 'Sort lines reverse alphabetically (Z to A).' },
  { id: 'numeric', label: 'Sort 0 → 9', description: 'Sort lines numerically (0 to 9).' },
  {
    id: 'natural',
    label: 'Sort Naturally',
    description: 'Sort lines in natural order (e.g., 1, 2, 10).',
  },
  { id: 'shuffle', label: 'Shuffle Lines', description: 'Shuffle lines randomly.' },
  { id: 'dedupe', label: 'Remove Duplicates', description: 'Remove duplicate lines.' },
];

const CHUNK_PATTERN = /(\d+|\D+)/g;

/** Compares "item 2" before "item 10" by splitting each line into alternating digit and non
 * digit runs and comparing digit runs numerically, everything else as plain text. */
function naturalCompare(a: string, b: string): number {
  const partsA = a.match(CHUNK_PATTERN) ?? [a];
  const partsB = b.match(CHUNK_PATTERN) ?? [b];
  const length = Math.max(partsA.length, partsB.length);

  for (let index = 0; index < length; index += 1) {
    const partA = partsA[index] ?? '';
    const partB = partsB[index] ?? '';
    const numberA = Number(partA);
    const numberB = Number(partB);
    const bothNumeric = partA !== '' && partB !== '' && !Number.isNaN(numberA) && !Number.isNaN(numberB);

    if (bothNumeric) {
      if (numberA !== numberB) return numberA - numberB;
    } else if (partA !== partB) {
      return partA < partB ? -1 : 1;
    }
  }
  return 0;
}

/** Fisher-Yates, so every ordering of the lines is equally likely. */
function shuffleLines(lines: readonly string[]): string[] {
  const result = [...lines];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapWith]] = [result[swapWith]!, result[index]!];
  }
  return result;
}

export function sortLines(text: string, mode: SortMode): string {
  const lines = text.split('\n');
  switch (mode) {
    case 'az':
      // Plain string comparison, not localeCompare: ASCII order (uppercase before lowercase)
      // is what "Sort A to Z" means for a slug or identifier list, the common case here.
      return [...lines].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join('\n');
    case 'za':
      return [...lines].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)).join('\n');
    case 'numeric':
      return [...lines].sort((a, b) => (Number(a) || 0) - (Number(b) || 0)).join('\n');
    case 'natural':
      return [...lines].sort(naturalCompare).join('\n');
    case 'shuffle':
      return shuffleLines(lines).join('\n');
    case 'dedupe':
      return [...new Set(lines)].join('\n');
  }
}

export interface LineStats {
  lines: number;
  words: number;
  uniqueLines: number;
}

export function countLineStats(text: string): LineStats {
  if (text === '') return { lines: 0, words: 0, uniqueLines: 0 };
  const lines = text.split('\n');
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  return { lines: lines.length, words, uniqueLines: new Set(lines).size };
}
