export type ReverseMode = 'text' | 'words' | 'letters' | 'lines';

export interface ReverseOption {
  id: ReverseMode;
  label: string;
  description: string;
}

export const REVERSE_OPTIONS: readonly ReverseOption[] = [
  { id: 'text', label: 'Reverse Whole Text', description: 'Reverse the entire text.' },
  { id: 'words', label: 'Reverse Words', description: 'Reverse the order of words in the text.' },
  { id: 'letters', label: 'Reverse Letters', description: 'Reverse every letter in the text.' },
  { id: 'lines', label: 'Reverse Lines', description: 'Reverse the order of lines.' },
];

/** Reverses the order of words on each line, keeping every word spelled forwards and each
 * line's own boundary intact — only Reverse Lines below reorders lines. */
function reverseWordOrder(text: string): string {
  return text
    .split('\n')
    .map((line) => line.split(/\s+/).filter(Boolean).reverse().join(' '))
    .join('\n');
}

/** Spells every whitespace separated token backwards, in place, leaving word order, spacing
 * and line breaks exactly where they were. */
function reverseLettersInPlace(text: string): string {
  return text.replace(/\S+/g, (token) => Array.from(token).reverse().join(''));
}

export function reverseText(text: string, mode: ReverseMode): string {
  switch (mode) {
    case 'text':
      // Array.from, not text.split(''), so a surrogate pair (an emoji, say) reverses as one
      // unit instead of splitting into two invalid halves.
      return Array.from(text).reverse().join('');
    case 'words':
      return reverseWordOrder(text);
    case 'letters':
      return reverseLettersInPlace(text);
    case 'lines':
      return text.split('\n').reverse().join('\n');
  }
}
