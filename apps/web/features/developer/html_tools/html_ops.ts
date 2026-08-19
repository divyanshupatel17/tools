/**
 * Named entities beyond the five reserved XML characters, used only by `encodeHtmlEntities` to
 * pick a readable name over a numeric reference. Grouped: Latin-1 supplement, punctuation,
 * currency/symbols, Greek letters, math, arrows.
 */
const NAMED_ENTITY_BY_CHAR: Record<string, string> = {
  ' ': 'nbsp', '¡': 'iexcl', '¢': 'cent', '£': 'pound', '¤': 'curren',
  '¥': 'yen', '¦': 'brvbar', '§': 'sect', '¨': 'uml', '©': 'copy',
  'ª': 'ordf', '«': 'laquo', '¬': 'not', '­': 'shy', '®': 'reg',
  '¯': 'macr', '°': 'deg', '±': 'plusmn', '²': 'sup2', '³': 'sup3',
  '´': 'acute', 'µ': 'micro', '¶': 'para', '·': 'middot', '¸': 'cedil',
  '¹': 'sup1', 'º': 'ordm', '»': 'raquo', '¼': 'frac14', '½': 'frac12',
  '¾': 'frac34', '¿': 'iquest', 'À': 'Agrave', 'Á': 'Aacute', 'Â': 'Acirc',
  'Ã': 'Atilde', 'Ä': 'Auml', 'Å': 'Aring', 'Æ': 'AElig', 'Ç': 'Ccedil',
  'È': 'Egrave', 'É': 'Eacute', 'Ê': 'Ecirc', 'Ë': 'Euml', 'Ì': 'Igrave',
  'Í': 'Iacute', 'Î': 'Icirc', 'Ï': 'Iuml', 'Ð': 'ETH', 'Ñ': 'Ntilde',
  'Ò': 'Ograve', 'Ó': 'Oacute', 'Ô': 'Ocirc', 'Õ': 'Otilde', 'Ö': 'Ouml',
  '×': 'times', 'Ø': 'Oslash', 'Ù': 'Ugrave', 'Ú': 'Uacute', 'Û': 'Ucirc',
  'Ü': 'Uuml', 'Ý': 'Yacute', 'Þ': 'THORN', 'ß': 'szlig', 'à': 'agrave',
  'á': 'aacute', 'â': 'acirc', 'ã': 'atilde', 'ä': 'auml', 'å': 'aring',
  'æ': 'aelig', 'ç': 'ccedil', 'è': 'egrave', 'é': 'eacute', 'ê': 'ecirc',
  'ë': 'euml', 'ì': 'igrave', 'í': 'iacute', 'î': 'icirc', 'ï': 'iuml',
  'ð': 'eth', 'ñ': 'ntilde', 'ò': 'ograve', 'ó': 'oacute', 'ô': 'ocirc',
  'õ': 'otilde', 'ö': 'ouml', '÷': 'divide', 'ø': 'oslash', 'ù': 'ugrave',
  'ú': 'uacute', 'û': 'ucirc', 'ü': 'uuml', 'ý': 'yacute', 'þ': 'thorn',
  'ÿ': 'yuml',
  '–': 'ndash', '—': 'mdash', '‘': 'lsquo', '’': 'rsquo', '‚': 'sbquo',
  '“': 'ldquo', '”': 'rdquo', '„': 'bdquo', '†': 'dagger', '‡': 'Dagger',
  '•': 'bull', '…': 'hellip', '‰': 'permil', '′': 'prime', '″': 'Prime',
  '‹': 'lsaquo', '›': 'rsaquo', '‾': 'oline', '⁄': 'frasl', '€': 'euro',
  '™': 'trade', '←': 'larr', '↑': 'uarr', '→': 'rarr', '↓': 'darr',
  '↔': 'harr', '↵': 'crarr', '∀': 'forall', '∂': 'part', '∃': 'exist',
  '∅': 'empty', '∇': 'nabla', '∈': 'isin', '∉': 'notin', '∋': 'ni',
  '∏': 'prod', '∑': 'sum', '−': 'minus', '∗': 'lowast', '√': 'radic',
  '∝': 'prop', '∞': 'infin', '∠': 'ang', '∧': 'and', '∨': 'or',
  '∩': 'cap', '∪': 'cup', '∫': 'int', '∴': 'there4', '∼': 'sim',
  '≅': 'cong', '≈': 'asymp', '≠': 'ne', '≡': 'equiv', '≤': 'le',
  '≥': 'ge', '⊂': 'sub', '⊃': 'sup', '⊄': 'nsub', '⊆': 'sube',
  '⊇': 'supe', '⊕': 'oplus', '⊗': 'otimes', '⊥': 'perp', '⋅': 'sdot',
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon',
  'ζ': 'zeta', 'η': 'eta', 'θ': 'theta', 'ι': 'iota', 'κ': 'kappa',
  'λ': 'lambda', 'μ': 'mu', 'ν': 'nu', 'ξ': 'xi', 'ο': 'omicron',
  'π': 'pi', 'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'υ': 'upsilon',
  'φ': 'phi', 'χ': 'chi', 'ψ': 'psi', 'ω': 'omega',
  'Α': 'Alpha', 'Β': 'Beta', 'Γ': 'Gamma', 'Δ': 'Delta', 'Ε': 'Epsilon',
  'Σ': 'Sigma', 'Ω': 'Omega', 'Φ': 'Phi', 'Π': 'Pi', 'Ψ': 'Psi',
};

export type HtmlOperation = 'encode' | 'decode' | 'escape' | 'unescape' | 'minify' | 'beautify' | 'strip';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Full entity encode: the five reserved characters plus every non ASCII character, named where
 * a common entity exists, numeric otherwise. Unlike `escapeHtml`, this also makes the output
 * safe to save as plain ASCII. */
export function encodeHtmlEntities(text: string): string {
  let out = '';
  for (const char of text) {
    if (char === '&') out += '&amp;';
    else if (char === '<') out += '&lt;';
    else if (char === '>') out += '&gt;';
    else if (char === '"') out += '&quot;';
    else if (char === "'") out += '&#39;';
    else {
      const code = char.codePointAt(0) ?? 0;
      if (code <= 127) {
        out += char;
      } else {
        const named = NAMED_ENTITY_BY_CHAR[char];
        out += named ? `&${named};` : `&#${code};`;
      }
    }
  }
  return out;
}

/** Decodes any named or numeric entity by letting the browser's own HTML parser resolve it,
 * rather than maintaining a decode table by hand. Never throws: unrecognised entities are left
 * as literal text by the parser itself. */
export function decodeHtmlEntities(text: string): string {
  if (typeof document === 'undefined') return text;
  const el = document.createElement('textarea');
  el.innerHTML = text;
  return el.value;
}

export async function minifyHtmlSource(source: string): Promise<string> {
  const { minify } = await import('html-minifier-terser');
  return minify(source, {
    collapseWhitespace: true,
    removeComments: true,
    minifyJS: true,
    // CSS minification is left off: html-minifier-terser's CSS path shells out to clean-css,
    // which statically imports Node's `fs` and cannot be bundled for the browser.
    removeAttributeQuotes: false,
    removeRedundantAttributes: false,
  });
}

export async function beautifyHtmlSource(source: string): Promise<string> {
  const prettier = await import('prettier/standalone');
  const html = await import('prettier/plugins/html');
  return prettier.format(source, {
    parser: 'html',
    plugins: [html.default ?? html],
    printWidth: 100,
    htmlWhitespaceSensitivity: 'css',
  });
}

/** Strips tags via the browser's own HTML parser (DOMParser never executes scripts or loads
 * resources), leaving readable text with collapsed blank lines. */
export function stripHtmlTags(source: string): string {
  if (typeof DOMParser === 'undefined') return source;
  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('script, style').forEach((node) => node.remove());
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export interface HtmlOpSuccess {
  ok: true;
  text: string;
}
export interface HtmlOpFailure {
  ok: false;
  message: string;
}
export type HtmlOpResult = HtmlOpSuccess | HtmlOpFailure;

/** Runs `operation` against `source`. Only minify and beautify can genuinely fail (a real parser
 * sits behind each); every other operation always succeeds. */
export async function runHtmlOperation(operation: HtmlOperation, source: string): Promise<HtmlOpResult> {
  try {
    switch (operation) {
      case 'encode':
        return { ok: true, text: encodeHtmlEntities(source) };
      case 'decode':
      case 'unescape':
        return { ok: true, text: decodeHtmlEntities(source) };
      case 'escape':
        return { ok: true, text: escapeHtml(source) };
      case 'minify':
        return { ok: true, text: await minifyHtmlSource(source) };
      case 'beautify':
        return { ok: true, text: await beautifyHtmlSource(source) };
      case 'strip':
        return { ok: true, text: stripHtmlTags(source) };
      default:
        return { ok: true, text: source };
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'That HTML could not be processed.' };
  }
}
