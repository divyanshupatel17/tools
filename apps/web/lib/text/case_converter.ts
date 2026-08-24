export type CaseId =
  | 'sentence'
  | 'title'
  | 'upper'
  | 'lower'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'constant';

export interface CaseOption {
  id: CaseId;
  /** Shown verbatim — some (snake_case, kebab-case, CONSTANT_CASE) are punctuated by
   * definition, not prose, so never "fix" the punctuation here. */
  label: string;
  monogram: string;
  fileName: string;
}

export const CASE_OPTIONS: readonly CaseOption[] = [
  { id: 'sentence', label: 'Sentence case', monogram: 'Aa', fileName: 'sentence-case' },
  { id: 'title', label: 'Title Case', monogram: 'Tt', fileName: 'title-case' },
  { id: 'upper', label: 'UPPERCASE', monogram: 'AA', fileName: 'uppercase' },
  { id: 'lower', label: 'lowercase', monogram: 'aa', fileName: 'lowercase' },
  { id: 'camel', label: 'camelCase', monogram: 'Cc', fileName: 'camel-case' },
  { id: 'pascal', label: 'PascalCase', monogram: 'Pc', fileName: 'pascal-case' },
  { id: 'snake', label: 'snake_case', monogram: '_', fileName: 'snake_case' },
  { id: 'kebab', label: 'kebab-case', monogram: '-', fileName: 'kebab-case' },
  { id: 'constant', label: 'CONSTANT_CASE', monogram: 'C_', fileName: 'CONSTANT_CASE' },
];

// Captured so delimiters pass through untouched while text either side gets capitalized.
const SENTENCE_BOUNDARY = /([.!?]+\s+|\n+)/;

function capitalizeFirstLetter(segment: string): string {
  const match = /[a-zA-Z]/.exec(segment);
  if (!match || match.index === undefined) return segment;
  const index = match.index;
  return segment.slice(0, index) + segment[index]!.toUpperCase() + segment.slice(index + 1);
}

function toSentenceCase(text: string): string {
  const parts = text.toLowerCase().split(SENTENCE_BOUNDARY);
  return parts.map((part, index) => (index % 2 === 0 ? capitalizeFirstLetter(part) : part)).join('');
}

function toTitleCase(text: string): string {
  return text.toLowerCase().replace(/[a-z]/, (ch) => ch).replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

/** camelCase/PascalCase boundaries, snake/kebab separators, and other punctuation all count
 * as word breaks, so pasting an existing identifier normalizes cleanly into any other case. */
function tokenizeLine(line: string): string[] {
  return line
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function toCamelWords(words: readonly string[]): string {
  return words
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word[0]!.toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');
}

function toPascalWords(words: readonly string[]): string {
  return words.map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase()).join('');
}

function toSnakeWords(words: readonly string[]): string {
  return words.map((word) => word.toLowerCase()).join('_');
}

function toKebabWords(words: readonly string[]): string {
  return words.map((word) => word.toLowerCase()).join('-');
}

function toConstantWords(words: readonly string[]): string {
  return words.map((word) => word.toUpperCase()).join('_');
}

/** Runs per line, so a pasted list of phrases becomes a list of identifiers, not one run-on. */
function convertIdentifierCase(text: string, build: (words: readonly string[]) => string): string {
  return text
    .split('\n')
    .map((line) => {
      const words = tokenizeLine(line);
      return words.length > 0 ? build(words) : '';
    })
    .join('\n');
}

export function convertCase(text: string, caseId: CaseId): string {
  switch (caseId) {
    case 'sentence':
      return toSentenceCase(text);
    case 'title':
      return toTitleCase(text);
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'camel':
      return convertIdentifierCase(text, toCamelWords);
    case 'pascal':
      return convertIdentifierCase(text, toPascalWords);
    case 'snake':
      return convertIdentifierCase(text, toSnakeWords);
    case 'kebab':
      return convertIdentifierCase(text, toKebabWords);
    case 'constant':
      return convertIdentifierCase(text, toConstantWords);
  }
}
