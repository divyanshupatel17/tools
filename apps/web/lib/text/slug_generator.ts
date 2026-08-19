export interface SlugOptions {
  /** Defaults to true; the tip in the workspace states this outright rather than offering a
   * toggle, since an uppercase URL slug is never actually preferable for SEO. */
  lowercase?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SEPARATOR = '-';
const SEPARATOR_RUN = new RegExp(`${escapeRegExp(SEPARATOR)}+`, 'g');
const SEPARATOR_EDGE = new RegExp(`^${escapeRegExp(SEPARATOR)}+|${escapeRegExp(SEPARATOR)}+$`, 'g');

/** Turns a title into a clean, hyphenated URL slug: diacritics are stripped rather than
 * dropped (so "café" becomes "cafe", not "caf"), every run of anything that is not a letter
 * or digit becomes a single hyphen, and leading/trailing hyphens are trimmed. */
export function generateSlug(title: string, options: SlugOptions = {}): string {
  const lowercase = options.lowercase ?? true;

  let slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, SEPARATOR)
    .replace(SEPARATOR_RUN, SEPARATOR)
    .replace(SEPARATOR_EDGE, '');

  if (lowercase) slug = slug.toLowerCase();
  return slug;
}
