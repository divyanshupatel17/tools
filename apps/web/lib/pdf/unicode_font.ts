import type { Font as FontkitFont } from '@pdf-lib/fontkit';
import { PDFName, PDFString } from 'pdf-lib';
import { SITE_BASE_PATH } from '@/lib/seo/site';

export type PdfLibModule = typeof import('pdf-lib');
export type PdfPage = ReturnType<
  Awaited<ReturnType<PdfLibModule['PDFDocument']['create']>>['addPage']
>;
export type PdfFont = Awaited<
  ReturnType<Awaited<ReturnType<PdfLibModule['PDFDocument']['create']>>['embedFont']>
>;

/**
 * pdf-lib's `StandardFonts` (Helvetica, Courier, ...) use WinAnsi encoding — a ~220-character
 * Windows-1252 subset. Anything outside it (arrows, smart quotes, most symbols, any non-Latin
 * script) throws "WinAnsi cannot encode" at draw time, so every "build a PDF from user text"
 * tool embeds real Unicode fonts instead. Noto Sans covers Latin/Cyrillic/Greek plus general
 * punctuation; Noto Sans Symbols / Symbols 2 cover arrows, math and dingbats, which Noto
 * deliberately ships as separate fonts rather than folding into Sans. A character in neither
 * (CJK, Arabic, emoji, ...) falls back to "?" rather than crashing the whole document — see
 * `resolveGlyphFont`.
 */
export interface LoadedFont {
  pdf: PdfFont;
  raw: FontkitFont;
}

export interface UnicodeFonts {
  regular: LoadedFont;
  bold: LoadedFont;
  italic: LoadedFont;
  boldItalic: LoadedFont;
  mono: LoadedFont;
  /** Applied to any of the styles above when a codepoint is missing from it. */
  symbolFallbacks: LoadedFont[];
}

/** A run of text sharing one inline style — the unit `markdown_blocks.ts` and `html_blocks.ts`
 * parse `**bold**`/`*italic*`/`` `code` `` (or `<b>`/`<i>`/`<code>`) into. */
export interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Renders in the monospace font; does not combine with bold/italic (no such Noto Mono variant is loaded). */
  mono?: boolean;
  strikethrough?: boolean;
  /** A clickable target URL; the span draws in the link color with an underline and gets a real PDF link annotation. */
  link?: string;
}

const FONT_FILES = {
  regular: 'NotoSans-Regular.ttf',
  bold: 'NotoSans-Bold.ttf',
  italic: 'NotoSans-Italic.ttf',
  boldItalic: 'NotoSans-BoldItalic.ttf',
  mono: 'NotoSansMono-Regular.ttf',
  symbols: 'NotoSansSymbols-Regular.ttf',
  symbols2: 'NotoSansSymbols2-Regular.ttf',
} as const;

async function fetchFontBytes(fileName: string): Promise<Uint8Array> {
  const response = await fetch(`${SITE_BASE_PATH}/fonts/${fileName}`);
  if (!response.ok) throw new Error(`Could not load the ${fileName} font.`);
  return new Uint8Array(await response.arrayBuffer());
}

async function loadFont(
  document_: import('pdf-lib').PDFDocument,
  fontkit: typeof import('@pdf-lib/fontkit'),
  fileName: string,
): Promise<LoadedFont> {
  const bytes = await fetchFontBytes(fileName);
  const [pdf, raw] = await Promise.all([
    document_.embedFont(bytes, { subset: true }),
    Promise.resolve(fontkit.create(bytes)),
  ]);
  return { pdf, raw };
}

/** Loads and embeds the full Unicode font set into `document_`. Call once per document. */
export async function loadUnicodeFonts(
  document_: import('pdf-lib').PDFDocument,
): Promise<UnicodeFonts> {
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  document_.registerFontkit(fontkit);

  const [regular, bold, italic, boldItalic, mono, symbols, symbols2] = await Promise.all([
    loadFont(document_, fontkit, FONT_FILES.regular),
    loadFont(document_, fontkit, FONT_FILES.bold),
    loadFont(document_, fontkit, FONT_FILES.italic),
    loadFont(document_, fontkit, FONT_FILES.boldItalic),
    loadFont(document_, fontkit, FONT_FILES.mono),
    loadFont(document_, fontkit, FONT_FILES.symbols),
    loadFont(document_, fontkit, FONT_FILES.symbols2),
  ]);

  return { regular, bold, italic, boldItalic, mono, symbolFallbacks: [symbols, symbols2] };
}

/** Picks the loaded font a span's style maps to. Bold+italic combine; mono ignores both. */
export function pickStyledFont(
  fonts: UnicodeFonts,
  span: { bold?: boolean; italic?: boolean; mono?: boolean },
): LoadedFont {
  if (span.mono) return fonts.mono;
  if (span.bold && span.italic) return fonts.boldItalic;
  if (span.bold) return fonts.bold;
  if (span.italic) return fonts.italic;
  return fonts.regular;
}

const FALLBACK_CHAR = '?';

function resolveGlyphFont(
  codePoint: number,
  primary: LoadedFont,
  fonts: UnicodeFonts,
): LoadedFont | null {
  if (primary.raw.hasGlyphForCodePoint(codePoint)) return primary;
  for (const fallback of fonts.symbolFallbacks) {
    if (fallback.raw.hasGlyphForCodePoint(codePoint)) return fallback;
  }
  return null;
}

interface Run {
  text: string;
  font: LoadedFont;
  strikethrough?: boolean;
  link?: string;
}

const LINK_COLOR: readonly [number, number, number] = [0.11, 0.38, 0.85];

/** Registers a clickable URI link annotation over the given text rectangle. */
function addLinkAnnotation(
  page: PdfPage,
  url: string,
  x: number,
  y: number,
  width: number,
  size: number,
): void {
  const { context } = page.doc;
  const annotation = context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x, y - size * 0.2, x + width, y + size * 0.9],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
  });
  const ref = context.register(annotation);
  const existing = page.node.Annots();
  if (existing) existing.push(ref);
  else page.node.set(PDFName.of('Annots'), context.obj([ref]));
}

/** Splits `text` into runs of consecutive characters that share the same resolved font,
 * substituting `?` for any character no loaded font can render. */
function splitRuns(text: string, primary: LoadedFont, fonts: UnicodeFonts): Run[] {
  const runs: Run[] = [];
  for (const char of text) {
    const codePoint = char.codePointAt(0)!;
    const resolved = resolveGlyphFont(codePoint, primary, fonts);
    const font = resolved ?? primary;
    const drawChar = resolved ? char : FALLBACK_CHAR;

    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += drawChar;
    else runs.push({ text: drawChar, font });
  }
  return runs;
}

/** Unicode-aware replacement for `font.widthOfTextAtSize`, measuring across font runs. */
export function measureUnicodeText(
  text: string,
  primary: LoadedFont,
  fonts: UnicodeFonts,
  size: number,
): number {
  return splitRuns(text, primary, fonts).reduce(
    (sum, run) => sum + run.font.pdf.widthOfTextAtSize(run.text, size),
    0,
  );
}

/** Unicode-aware replacement for `page.drawText`, drawing each font run in turn. `rotate` and
 * `opacity` apply to every run identically (a watermark's use case), not per-run. */
export function drawUnicodeText(
  page: PdfPage,
  text: string,
  x: number,
  y: number,
  primary: LoadedFont,
  fonts: UnicodeFonts,
  size: number,
  color: readonly [number, number, number],
  rgb: typeof import('pdf-lib').rgb,
  extra?: { rotate?: ReturnType<typeof import('pdf-lib').degrees>; opacity?: number },
): void {
  let cursorX = x;
  for (const run of splitRuns(text, primary, fonts)) {
    page.drawText(run.text, {
      x: cursorX,
      y,
      size,
      font: run.font.pdf,
      color: rgb(...color),
      ...extra,
    });
    cursorX += run.font.pdf.widthOfTextAtSize(run.text, size);
  }
}

/** Unicode-aware word wrap: greedy, with per-character fallback for a single word wider than `maxWidth`. */
export function wrapUnicodeText(
  text: string,
  primary: LoadedFont,
  fonts: UnicodeFonts,
  size: number,
  maxWidth: number,
): string[] {
  if (text.trim() === '') return [''];
  const words = text.split(/\s+/).filter((word) => word !== '');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measureUnicodeText(candidate, primary, fonts, size) <= maxWidth || !line) {
      if (measureUnicodeText(word, primary, fonts, size) > maxWidth && !line) {
        let chunk = '';
        for (const char of word) {
          const next = chunk + char;
          if (measureUnicodeText(next, primary, fonts, size) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk = next;
          }
        }
        line = chunk;
      } else {
        line = candidate;
      }
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

// ---------------------------------------------------------------------------------------------
// Span-aware layout: used where text carries inline styling (bold/italic/code), i.e. Markdown
// and HTML to PDF's paragraph, heading, list and table content. Wrapping has to happen below
// the span boundary (a bold word can sit mid-sentence), so a "word" here is a run of non-space
// `RenderChar`s that may itself mix styles when spans abut with no space between them.
// ---------------------------------------------------------------------------------------------

interface RenderChar {
  char: string;
  font: LoadedFont;
  strikethrough?: boolean;
  link?: string;
}

/** Opaque pre-resolved output of `wrapInlineSpans` — one wrapped line, ready to measure and draw
 * without re-resolving style or glyph fallback. */
export type WrappedLine = readonly RenderChar[];

function resolveChar(char: string, styleFont: LoadedFont, fonts: UnicodeFonts): RenderChar {
  const codePoint = char.codePointAt(0)!;
  const resolved = resolveGlyphFont(codePoint, styleFont, fonts);
  return resolved ? { char, font: resolved } : { char: FALLBACK_CHAR, font: styleFont };
}

function spansToRenderChars(spans: readonly InlineSpan[], fonts: UnicodeFonts): RenderChar[] {
  const chars: RenderChar[] = [];
  for (const span of spans) {
    const styleFont = pickStyledFont(fonts, span);
    for (const char of span.text) {
      const resolved = resolveChar(char, styleFont, fonts);
      chars.push({ ...resolved, strikethrough: span.strikethrough, link: span.link });
    }
  }
  return chars;
}

function mergeIntoRuns(chars: readonly RenderChar[]): Run[] {
  const runs: Run[] = [];
  for (const { char, font, strikethrough, link } of chars) {
    const last = runs[runs.length - 1];
    if (last && last.font === font && last.strikethrough === strikethrough && last.link === link) {
      last.text += char;
    } else {
      runs.push({ text: char, font, strikethrough, link });
    }
  }
  return runs;
}

function measureRenderChars(chars: readonly RenderChar[], size: number): number {
  return mergeIntoRuns(chars).reduce(
    (sum, run) => sum + run.font.pdf.widthOfTextAtSize(run.text, size),
    0,
  );
}

/** Draws one already-wrapped line returned by `wrapInlineSpans`. */
export function drawInlineLine(
  page: PdfPage,
  line: WrappedLine,
  x: number,
  y: number,
  size: number,
  color: readonly [number, number, number],
  rgb: typeof import('pdf-lib').rgb,
): void {
  let cursorX = x;
  for (const run of mergeIntoRuns(line)) {
    const runColor = run.link ? LINK_COLOR : color;
    page.drawText(run.text, { x: cursorX, y, size, font: run.font.pdf, color: rgb(...runColor) });
    const width = run.font.pdf.widthOfTextAtSize(run.text, size);

    if (run.strikethrough) {
      page.drawLine({
        start: { x: cursorX, y: y + size * 0.32 },
        end: { x: cursorX + width, y: y + size * 0.32 },
        thickness: Math.max(size * 0.06, 0.5),
        color: rgb(...runColor),
      });
    }

    if (run.link) {
      page.drawLine({
        start: { x: cursorX, y: y - size * 0.08 },
        end: { x: cursorX + width, y: y - size * 0.08 },
        thickness: Math.max(size * 0.05, 0.4),
        color: rgb(...LINK_COLOR),
      });
      addLinkAnnotation(page, run.link, cursorX, y, width, size);
    }

    cursorX += width;
  }
}

/** Width of an already-wrapped line, e.g. for centring or measuring a wrapped table cell. */
export function measureInlineLine(line: WrappedLine, size: number): number {
  return measureRenderChars(line, size);
}

/**
 * Wraps styled inline spans to `maxWidth`, returning each output line pre-resolved (style and
 * glyph fallback both already applied) and ready for `drawInlineLine`/`measureInlineLine`. A
 * single unbreakable word wider than `maxWidth` is split by character, same as the plain-text
 * wrapper.
 */
export function wrapInlineSpans(
  spans: readonly InlineSpan[],
  fonts: UnicodeFonts,
  size: number,
  maxWidth: number,
): WrappedLine[] {
  const allChars = spansToRenderChars(spans, fonts);
  if (allChars.length === 0) return [[]];

  const words: RenderChar[][] = [];
  let word: RenderChar[] = [];
  for (const rc of allChars) {
    if (/\s/.test(rc.char)) {
      if (word.length > 0) {
        words.push(word);
        word = [];
      }
    } else {
      word.push(rc);
    }
  }
  if (word.length > 0) words.push(word);
  if (words.length === 0) return [[]];

  const spaceWidth = fonts.regular.pdf.widthOfTextAtSize(' ', size);
  const lines: RenderChar[][] = [];
  let line: RenderChar[] = [];
  let lineWidth = 0;

  for (const w of words) {
    const wWidth = measureRenderChars(w, size);

    if (wWidth > maxWidth && line.length === 0) {
      // Doesn't fit on an empty line either: break it by character.
      let chunk: RenderChar[] = [];
      let chunkWidth = 0;
      for (const rc of w) {
        const rcWidth = measureRenderChars([rc], size);
        if (chunkWidth + rcWidth > maxWidth && chunk.length > 0) {
          lines.push(chunk);
          chunk = [rc];
          chunkWidth = rcWidth;
        } else {
          chunk.push(rc);
          chunkWidth += rcWidth;
        }
      }
      line = chunk;
      lineWidth = chunkWidth;
      continue;
    }

    const extra = line.length > 0 ? spaceWidth + wWidth : wWidth;
    if (lineWidth + extra <= maxWidth || line.length === 0) {
      if (line.length > 0) line.push({ char: ' ', font: fonts.regular });
      line.push(...w);
      lineWidth += extra;
    } else {
      lines.push(line);
      line = [...w];
      lineWidth = wWidth;
    }
  }
  if (line.length > 0) lines.push(line);

  return lines;
}
