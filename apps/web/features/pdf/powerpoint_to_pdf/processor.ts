import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { readPptxSlides } from '@/lib/office/pptx_reader';
import { renderBlocksToPdf } from '@/lib/pdf/pdf_typeset';

export type PowerpointToPdfOptions = Record<string, unknown>;

/**
 * Reads every slide's text runs in slide order (`lib/office/pptx_reader.ts`) and typesets one
 * PDF page per slide. This is an outline export — the text a slide contains, laid out top to
 * bottom — not a picture of the slide: shape position, images, and any design are not read.
 */
const powerpointToPdf: ToolProcessor<PowerpointToPdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PPTX file to convert.');

  context.on_progress?.({ ratio: 0.1, label: 'Reading the slides' });
  let blocks;
  try {
    blocks = await readPptxSlides(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new ProcessorError('unreadable', 'That file could not be read as a .pptx.');
  }

  context.on_progress?.({ ratio: 0.5, label: 'Laying out the PDF' });
  const bytes = await renderBlocksToPdf(blocks, { pageSize: 'letter', marginPt: 48, fontSize: 14 });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'pdf'),
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      },
    ],
  };
};

export default powerpointToPdf;
