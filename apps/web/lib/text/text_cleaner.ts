export type CleanOptionId =
  | 'extra_spaces'
  | 'blank_lines'
  | 'invisible_characters'
  | 'emojis'
  | 'accents'
  | 'smart_quotes'
  | 'html_tags';

export interface CleanOptionInfo {
  id: CleanOptionId;
  label: string;
  description: string;
}

export const CLEAN_OPTIONS: readonly CleanOptionInfo[] = [
  { id: 'extra_spaces', label: 'Extra Spaces', description: 'Remove multiple spaces and tabs.' },
  { id: 'blank_lines', label: 'Blank Lines', description: 'Remove empty lines.' },
  {
    id: 'invisible_characters',
    label: 'Invisible Characters',
    description: 'Remove zero width and other invisible characters.',
  },
  { id: 'emojis', label: 'Emojis', description: 'Remove all emojis from text.' },
  { id: 'accents', label: 'Accents', description: 'Remove accents from characters.' },
  {
    id: 'smart_quotes',
    label: 'Smart Quotes',
    description: 'Replace smart quotes with regular quotes.',
  },
  { id: 'html_tags', label: 'HTML Tags', description: 'Remove HTML tags completely.' },
];

export type CleanOptions = Record<CleanOptionId, boolean>;

export const DEFAULT_CLEAN_OPTIONS: CleanOptions = {
  extra_spaces: true,
  blank_lines: true,
  invisible_characters: true,
  emojis: true,
  accents: true,
  smart_quotes: true,
  html_tags: true,
};

// Zero width spaces/joiners, bidi control characters and the BOM — invisible in every editor,
// but they still count as real characters and can break string matching downstream. Written as
// \u escapes, not literal characters, so the source itself stays free of invisible bytes.
const INVISIBLE_PATTERN = new RegExp('[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\uFEFF]', 'g');

// U+FE0F is the emoji "variation selector" that often trails a pictograph glyph.
const EMOJI_PATTERN = new RegExp('\\p{Extended_Pictographic}\\uFE0F?', 'gu');

const SMART_QUOTE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
];

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

function removeInvisibleCharacters(text: string): string {
  return text.replace(INVISIBLE_PATTERN, '');
}

function removeEmojis(text: string): string {
  return text.replace(EMOJI_PATTERN, '');
}

function removeAccents(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

function normalizeSmartQuotes(text: string): string {
  return SMART_QUOTE_REPLACEMENTS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text,
  );
}

/** Collapses runs of spaces and tabs to one space and trims each line's edges — never touches
 * the newlines themselves, so paragraph structure survives independently of Blank Lines. */
function removeExtraSpaces(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n');
}

function removeBlankLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
}

/** Runs whichever cleanups are on, in an order chosen so each pass sees clean input from the
 * last: strip markup and invisible noise first, normalize characters, then tidy whitespace and
 * blank lines last of all so both prior passes get a chance to leave new blank space behind. */
export function cleanText(text: string, options: CleanOptions): string {
  let result = text;
  if (options.html_tags) result = stripHtmlTags(result);
  if (options.invisible_characters) result = removeInvisibleCharacters(result);
  if (options.emojis) result = removeEmojis(result);
  if (options.accents) result = removeAccents(result);
  if (options.smart_quotes) result = normalizeSmartQuotes(result);
  if (options.extra_spaces) result = removeExtraSpaces(result);
  if (options.blank_lines) result = removeBlankLines(result);
  return result;
}
