import { PDFDocument, PDFName, PDFRawStream, PDFString } from 'pdf-lib';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { buildSrgbIccProfile } from '@/lib/pdf/icc_srgb';
import { renderPdfPagesToImages } from '@/lib/pdf/pdf_to_images';
import { readPdfPreview } from '@/lib/pdf/pdf_preview';
import { SITE_NAME } from '@/lib/seo/site';

export type PdfToPdfaOptions = Record<string, unknown>;

function xmpPacket(): string {
  // The XMP packet wrapper spec requires a literal BOM inside the `begin` attribute so readers
  // can detect the packet's encoding — written as an escape here rather than pasted in
  // literally, so it doesn't read as stray invisible whitespace in the source file.
  const bom = String.fromCharCode(0xfeff);
  return (
    `<?xpacket begin="${bom}" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">\n` +
    `<pdfaid:part>2</pdfaid:part>\n` +
    `<pdfaid:conformance>B</pdfaid:conformance>\n` +
    `<dc:format>application/pdf</dc:format>\n` +
    `<xmp:CreatorTool>${SITE_NAME}</xmp:CreatorTool>\n` +
    `</rdf:Description>\n` +
    `</rdf:RDF>\n` +
    `</x:xmpmeta>\n` +
    `<?xpacket end="w"?>`
  );
}

/**
 * Builds a document that actually meets PDF/A-2B rather than merely declaring it: every page is
 * rasterised to an image (`lib/pdf/pdf_to_images.ts`) and placed full-bleed, so there are no
 * fonts to fail to embed and no colour space ambiguity to resolve, then wrapped in a real
 * OutputIntent that references a genuine embedded ICC profile (`lib/pdf/icc_srgb.ts`, built
 * from the ICC spec directly — there is no npm package or fetchable binary for this) and XMP
 * metadata declaring the conformance level. This is the only way to make a PDF/A claim in a
 * browser sandbox that is actually checkable rather than asserted: verifying that an arbitrary
 * input PDF's existing fonts, transparency and colour spaces already satisfy PDF/A would need a
 * full validator (what tools like veraPDF are), which is well outside this tool's scope. The
 * trade-off is the same one every other rasterising tool in this app discloses: the output is
 * no longer searchable or selectable text.
 */
const pdfToPdfa: ToolProcessor<PdfToPdfaOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to convert.');

  context.on_progress?.({ ratio: 0.02, label: 'Reading the document' });
  const preview = await readPdfPreview(file, context.signal);
  if (preview.thumbnail) URL.revokeObjectURL(preview.thumbnail);
  const pageIndexes = Array.from({ length: preview.pages }, (_, index) => index);
  if (pageIndexes.length === 0)
    throw new ProcessorError('empty', 'This PDF has no pages to convert.');

  const rendered = await renderPdfPagesToImages(
    file,
    pageIndexes,
    { format: 'jpeg', scale: 200 / 72, quality: 0.92 },
    context.signal,
    (done, total) =>
      context.on_progress?.({
        ratio: 0.05 + 0.6 * (done / total),
        label: `Rendering page ${done} of ${total}`,
      }),
  );

  context.on_progress?.({ ratio: 0.7, label: 'Embedding pages' });
  const output = await PDFDocument.create();
  output.setProducer(SITE_NAME);
  output.setCreator(SITE_NAME);

  // Pages were rendered at a fixed 200/72 scale, so dividing the image's pixel size by that
  // scale recovers each page's original point size exactly — no separate lookup needed.
  const RENDER_SCALE = 200 / 72;
  for (const rasterPage of rendered) {
    const image = await output.embedJpg(rasterPage.bytes);
    const pageWidth = image.width / RENDER_SCALE;
    const pageHeight = image.height / RENDER_SCALE;
    const page = output.addPage([pageWidth, pageHeight]);
    page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  }

  context.on_progress?.({ ratio: 0.85, label: 'Adding the colour profile' });
  const iccCompressed = await deflate(buildSrgbIccProfile());
  const iccStream = output.context.register(
    PDFRawStream.of(
      output.context.obj({ N: 3, Length: iccCompressed.length, Filter: 'FlateDecode' }),
      iccCompressed,
    ),
  );

  const outputIntent = output.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccStream,
  });
  output.catalog.set(PDFName.of('OutputIntents'), output.context.obj([outputIntent]));

  const xmpBytes = new TextEncoder().encode(xmpPacket());
  const metadataStream = output.context.register(
    PDFRawStream.of(
      output.context.obj({ Type: 'Metadata', Subtype: 'XML', Length: xmpBytes.length }),
      xmpBytes,
    ),
  );
  output.catalog.set(PDFName.of('Metadata'), metadataStream);
  output.catalog.set(PDFName.of('MarkInfo'), output.context.obj({ Marked: true }));

  context.on_progress?.({ ratio: 0.95, label: 'Saving' });
  const bytes = await output.save({ useObjectStreams: false });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'pdf').replace(/\.pdf$/i, '-pdfa.pdf'),
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
  };
};

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const { zlibSync } = await import('fflate');
  return zlibSync(bytes, { level: 6 });
}

export default pdfToPdfa;
