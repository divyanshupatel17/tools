import type { DocBlock, InlineSpan } from '@/lib/pdf/pdf_typeset';
import { readOoxmlPackage, readOoxmlText, stripXmlTags } from './ooxml';

/** Orders slides the way PowerPoint actually does — by `presentation.xml`'s `<p:sldId>` list,
 * resolved through `presentation.xml.rels` — rather than trusting `slideN.xml` filenames to
 * sort correctly, which is not guaranteed once slides have been reordered, added or removed in
 * an editor. */
async function orderedSlidePaths(files: Record<string, Uint8Array>): Promise<string[]> {
  const presentationXml = await readOoxmlText(files, 'ppt/presentation.xml');
  const relsXml = await readOoxmlText(files, 'ppt/_rels/presentation.xml.rels');
  if (!presentationXml || !relsXml)
    return Object.keys(files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));

  const relIds = [...presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map(
    (match) => match[1]!,
  );
  const targets = new Map<string, string>();
  for (const match of relsXml.matchAll(
    /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g,
  )) {
    targets.set(match[1]!, match[2]!);
  }

  return relIds.map((id) => `ppt/${targets.get(id)}`).filter((path) => files[path]);
}

/** Runs (`<a:r>`) inside one paragraph, each with its own bold/italic flags from `<a:rPr>` —
 * DrawingML's equivalent of `docx_reader.ts`'s `paragraphSpans`, reading `b="1"`/`i="1"`
 * attributes directly off `<a:rPr>` rather than a nested `<w:b/>` element. */
function paragraphSpans(xml: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const runPattern = /<a:r>([\s\S]*?)<\/a:r>/g;
  let match: RegExpExecArray | null;
  while ((match = runPattern.exec(xml))) {
    const run = match[1]!;
    const rPrMatch = /<a:rPr\b([^>]*)(?:\/>|>[\s\S]*?<\/a:rPr>)/.exec(run);
    const rPrAttrs = rPrMatch?.[1] ?? '';
    const bold = /\bb="(?:1|true)"/.test(rPrAttrs);
    const italic = /\bi="(?:1|true)"/.test(rPrAttrs);
    const textPattern = /<a:t>([\s\S]*?)<\/a:t>/g;
    let textMatch: RegExpExecArray | null;
    let text = '';
    while ((textMatch = textPattern.exec(run))) text += stripXmlTags(textMatch[1]!);
    if (text)
      spans.push({ text, ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}) });
  }
  return spans;
}

/** True when a paragraph explicitly turns its bullet off (`<a:buNone/>` inside `<a:pPr>`) —
 * placeholders default to bulleted body text, and an author can opt a single paragraph out. */
function paragraphHasNoBullet(xml: string): boolean {
  const withBody = /<a:pPr\b[^>]*>([\s\S]*?)<\/a:pPr>/.exec(xml);
  return withBody ? /<a:buNone\s*\/?>/.test(withBody[1]!) : false;
}

/** Reads a shape's `<p:nvSpPr>/<p:nvPr>/<p:ph>` to classify it as PowerPoint would: `title` /
 * `ctrTitle` is the slide's title placeholder, any other `<p:ph>` (with or without an explicit
 * `type`) is a body/content placeholder that gets bulleted text by default, and shapes with no
 * `<p:ph>` at all are plain text boxes, which are not bulleted. */
function shapePlaceholderType(shapeXml: string): 'title' | 'body' | null {
  const nvPr = /<p:nvSpPr>[\s\S]*?<p:nvPr>([\s\S]*?)<\/p:nvPr>/.exec(shapeXml)?.[1];
  if (!nvPr) return null;
  const ph = /<p:ph\b([^>]*)\/?>/.exec(nvPr);
  if (!ph) return null;
  const type = /\btype="([^"]+)"/.exec(ph[1]!)?.[1];
  return type === 'title' || type === 'ctrTitle' ? 'title' : 'body';
}

function slideBlocks(slideXml: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  const shapePattern = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  let shapeMatch: RegExpExecArray | null;

  while ((shapeMatch = shapePattern.exec(slideXml))) {
    const shapeXml = shapeMatch[0];
    const txBody = /<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(shapeXml)?.[1];
    if (!txBody) continue;

    const placeholder = shapePlaceholderType(shapeXml);
    const paragraphPattern = /<a:p>([\s\S]*?)<\/a:p>/g;
    let paragraphMatch: RegExpExecArray | null;

    while ((paragraphMatch = paragraphPattern.exec(txBody))) {
      const paragraphXml = paragraphMatch[1]!;
      const spans = paragraphSpans(paragraphXml);
      if (spans.length === 0 || spans.every((span) => span.text.trim().length === 0)) continue;

      if (placeholder === 'title') {
        blocks.push({ type: 'heading', level: 1, spans });
        continue;
      }

      const bulleted = placeholder === 'body' && !paragraphHasNoBullet(paragraphXml);
      if (!bulleted) {
        blocks.push({ type: 'paragraph', spans });
        continue;
      }

      const last = blocks[blocks.length - 1];
      if (last?.type === 'list' && !last.ordered) {
        last.items.push(spans);
      } else {
        blocks.push({ type: 'list', ordered: false, items: [spans] });
      }
    }
  }

  return blocks;
}

/** Reads every slide's shapes into the same `DocBlock[]` model `renderBlocksToPdf` consumes, one
 * PDF page per slide. This is a text outline export only: shape position, size, images and
 * design are not read, and `<a:pPr lvl>` sub-bullet nesting collapses to one flat list per slide
 * (`DocBlock`'s `list` variant has no depth field). */
export async function readPptxSlides(bytes: Uint8Array): Promise<DocBlock[]> {
  const files = await readOoxmlPackage(bytes);
  const slidePaths = await orderedSlidePaths(files);
  if (slidePaths.length === 0) throw new Error('No slides were found — this may not be a .pptx.');

  const blocks: DocBlock[] = [];
  for (let i = 0; i < slidePaths.length; i += 1) {
    if (i > 0) blocks.push({ type: 'pagebreak' });
    const slideXml = await readOoxmlText(files, slidePaths[i]!);
    if (slideXml) blocks.push(...slideBlocks(slideXml));
  }

  return blocks;
}
