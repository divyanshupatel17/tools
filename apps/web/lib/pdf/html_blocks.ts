import type { DocBlock, InlineSpan } from './pdf_typeset';

/** The common HTML4/Latin-1 named entities real-world pasted content actually uses —
 * typographic punctuation, currency, arrows and a handful of symbols/Greek letters. Anything
 * else falls through to the numeric-entity branch in `decodeEntities`, or is left as literal
 * text if it isn't even that; it is never a crash. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  deg: '°',
  times: '×',
  divide: '÷',
  plusmn: '±',
  sect: '§',
  para: '¶',
  bull: '•',
  middot: '·',
  dagger: '†',
  Dagger: '‡',
  permil: '‰',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  curren: '¤',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  laquo: '«',
  raquo: '»',
  sup1: '¹',
  sup2: '²',
  sup3: '³',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  pi: 'π',
  sigma: 'σ',
  omega: 'ω',
  infin: '∞',
  ne: '≠',
  le: '≤',
  ge: '≥',
  micro: 'µ',
  ordf: 'ª',
  ordm: 'º',
  shy: '',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  check: '✓',
  cross: '✗',
  star: '★',
  hearts: '♥',
  diams: '♦',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const codePoint =
        code[1] === 'x' || code[1] === 'X'
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    const value = NAMED_ENTITIES[code];
    return value !== undefined ? value : match;
  });
}

const INLINE_STYLE_TAG = /<(b|strong|i|em|code)\b[^>]*>/i;
const OTHER_TAG = /^<\/?[a-z][^>]*>/i;
const BR_TAG = /^<br\s*\/?>/i;

interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
}

/** Collapses whitespace within and trims leading/trailing whitespace across a span list,
 * dropping any span left empty — the span-aware equivalent of `.replace(/\s+/g,' ').trim()`. */
function normalizeSpans(spans: readonly InlineSpan[]): InlineSpan[] {
  const collapsed = spans
    .map((span) => ({ ...span, text: span.text.replace(/\s+/g, ' ') }))
    .filter((span) => span.text !== '');
  if (collapsed.length === 0) return [];
  collapsed[0] = { ...collapsed[0]!, text: collapsed[0]!.text.replace(/^\s+/, '') };
  const last = collapsed.length - 1;
  collapsed[last] = { ...collapsed[last]!, text: collapsed[last]!.text.replace(/\s+$/, '') };
  return collapsed.filter((span) => span.text !== '');
}

/**
 * Reads a fragment of HTML (already inside a block like `<p>` or `<li>`) into styled spans:
 * `<b>`/`<strong>` → bold, `<i>`/`<em>` → italic, `<code>` → monospace. Every other tag (div,
 * span, a, br, ...) is transparent — skipped, with its text content (and `<br>` as a space)
 * flowing into the surrounding span at whatever style was already active.
 */
function parseInlineHtml(html: string, inherited: InlineStyle = {}): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let buffer = '';
  let pos = 0;

  function flush() {
    if (buffer !== '') spans.push({ text: buffer, ...inherited });
    buffer = '';
  }

  while (pos < html.length) {
    const rest = html.slice(pos);

    if (BR_TAG.test(rest)) {
      buffer += ' ';
      pos += BR_TAG.exec(rest)![0].length;
      continue;
    }

    const styleMatch = INLINE_STYLE_TAG.exec(rest);
    if (styleMatch && styleMatch.index === 0) {
      flush();
      const tag = styleMatch[1]!.toLowerCase();
      const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
      const afterOpen = rest.slice(styleMatch[0].length);
      const closeMatch = closeRe.exec(afterOpen);
      const inner = closeMatch ? afterOpen.slice(0, closeMatch.index) : afterOpen;
      const consumed =
        styleMatch[0].length + inner.length + (closeMatch ? closeMatch[0].length : 0);

      const style: InlineStyle =
        tag === 'code'
          ? { ...inherited, mono: true }
          : tag === 'i' || tag === 'em'
            ? { ...inherited, italic: true }
            : { ...inherited, bold: true };
      spans.push(...parseInlineHtml(inner, style));

      pos += consumed;
      continue;
    }

    if (rest.startsWith('<')) {
      const otherMatch = OTHER_TAG.exec(rest);
      if (otherMatch) {
        pos += otherMatch[0].length;
        continue;
      }
    }

    const nextTag = rest.indexOf('<');
    const textRun = nextTag === -1 ? rest : rest.slice(0, nextTag);
    buffer += decodeEntities(textRun);
    pos += textRun.length || 1;
  }

  flush();
  return spans;
}

function listItems(html: string): InlineSpan[][] {
  const items: InlineSpan[][] = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const spans = normalizeSpans(parseInlineHtml(match[1]!));
    if (spans.length > 0) items.push(spans);
  }
  return items;
}

function tableRows(html: string): InlineSpan[][][] {
  const rows: InlineSpan[][][] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(html))) {
    const cells: InlineSpan[][] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1]!)))
      cells.push(normalizeSpans(parseInlineHtml(cellMatch[1]!)));
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

const BLOCK_OPEN = /<(h[1-6]|ul|ol|pre|table|p)\b[^>]*>/i;

/**
 * Reads pasted HTML linearly: a recognised block tag (h1-6, p, ul, ol, pre, table) is
 * captured structurally, with `<b>`/`<i>`/`<code>` inside it resolved to styled spans via
 * `parseInlineHtml`. Every other tag (div, span, a, ...) is transparent at the block level too
 * — its content flows into the surrounding paragraph. This is deliberately not a full HTML
 * parser: it does not build a DOM or resolve CSS, matching the tool's documented "structural
 * HTML only" limitation. A full document (`<!DOCTYPE>`, `<head>`, `<body>`) is narrowed to the
 * `<body>` content first, so page metadata never leaks into the output as paragraph text.
 */
export function parseHtmlToBlocks(html: string): DocBlock[] {
  let source = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');

  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(source);
  if (bodyMatch) source = bodyMatch[1]!;

  const blocks: DocBlock[] = [];
  let rawBuffer = '';
  let pos = 0;

  function flushParagraph() {
    const spans = normalizeSpans(parseInlineHtml(rawBuffer));
    if (spans.length > 0) blocks.push({ type: 'paragraph', spans });
    rawBuffer = '';
  }

  while (pos < source.length) {
    const rest = source.slice(pos);
    const openMatch = BLOCK_OPEN.exec(rest);

    if (openMatch && openMatch.index === 0) {
      flushParagraph();
      const tag = openMatch[1]!.toLowerCase();
      const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
      const afterOpen = rest.slice(openMatch[0].length);
      const closeMatch = closeRe.exec(afterOpen);
      const inner = closeMatch ? afterOpen.slice(0, closeMatch.index) : afterOpen;
      const consumed = openMatch[0].length + inner.length + (closeMatch ? closeMatch[0].length : 0);

      if (tag.startsWith('h')) {
        const level = Number(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6;
        const spans = normalizeSpans(parseInlineHtml(inner));
        if (spans.length > 0) blocks.push({ type: 'heading', level, spans });
      } else if (tag === 'p') {
        const spans = normalizeSpans(parseInlineHtml(inner));
        if (spans.length > 0) blocks.push({ type: 'paragraph', spans });
      } else if (tag === 'ul' || tag === 'ol') {
        const items = listItems(inner);
        if (items.length > 0) blocks.push({ type: 'list', ordered: tag === 'ol', items });
      } else if (tag === 'pre') {
        const text = decodeEntities(inner.replace(/<[^>]+>/g, ''));
        blocks.push({ type: 'code', lines: text.replace(/\r\n/g, '\n').split('\n') });
      } else if (tag === 'table') {
        const rows = tableRows(inner);
        if (rows.length > 0) blocks.push({ type: 'table', rows });
      }

      pos += consumed;
      continue;
    }

    if (rest.startsWith('<')) {
      const otherMatch = OTHER_TAG.exec(rest);
      if (otherMatch) {
        rawBuffer += otherMatch[0];
        pos += otherMatch[0].length;
        continue;
      }
    }

    const nextTag = rest.indexOf('<');
    const textRun = nextTag === -1 ? rest : rest.slice(0, nextTag);
    rawBuffer += textRun;
    pos += textRun.length || 1;
  }

  flushParagraph();
  return blocks;
}
