export type PageNumberPosition =
  | 'bottom-center'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'top-left'
  | 'top-right';

export type PageNumberFormat = 'n' | 'n-of-total' | 'page-n' | 'roman';

/** Points, matching pdf-lib's coordinate space — shared so the preview matches the export exactly. */
export const PAGE_NUMBER_MARGIN_PT = 28;

const ROMAN_TABLE: Array<[number, string]> = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

export function toRoman(value: number): string {
  let remaining = Math.max(1, Math.round(value));
  let result = '';
  for (const [amount, symbol] of ROMAN_TABLE) {
    while (remaining >= amount) {
      result += symbol;
      remaining -= amount;
    }
  }
  return result;
}

export function pageNumberLabel(format: PageNumberFormat, n: number, total: number): string {
  switch (format) {
    case 'n-of-total':
      return `${n} of ${total}`;
    case 'page-n':
      return `Page ${n}`;
    case 'roman':
      return toRoman(n);
    default:
      return String(n);
  }
}
