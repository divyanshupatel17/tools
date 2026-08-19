import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';

export interface RotatePdfOptions {
  /** 0-based page index to added-degrees (multiple of 90). Pages not listed are left alone. */
  rotations?: Record<number, number>;
}

/** Small enough to run on the main thread: no worker for a document this size. */
const rotatePdf: ToolProcessor<RotatePdfOptions> = async (input, context) => {
  const file = input.files[0];
  if (!file) throw new ProcessorError('missing_file', 'Add a PDF to rotate.');

  const rotations = input.options.rotations ?? {};
  const entries = Object.entries(rotations).filter(([, degrees]) => degrees % 360 !== 0);
  if (entries.length === 0) throw new ProcessorError('no_rotation', 'Rotate at least one page first.');

  context.on_progress?.({ ratio: 0, label: 'Reading the document' });
  const { PDFDocument, degrees } = await import('pdf-lib');
  const bytes = await file.arrayBuffer();
  if (context.signal.aborted) throw new ProcessorError('aborted', 'Cancelled.');

  const document_ = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pageCount = document_.getPageCount();

  for (const [key, delta] of entries) {
    const index = Number(key);
    if (index < 0 || index >= pageCount) continue;
    const page = document_.getPage(index);
    page.setRotation(degrees((page.getRotation().angle + delta) % 360));
  }

  context.on_progress?.({ ratio: 0.7, label: 'Saving the document' });
  const output = await document_.save({ useObjectStreams: true });
  context.on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: replaceExtension(file.name, 'pdf'),
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(output)], { type: 'application/pdf' }),
      },
    ],
    text: String(pageCount),
  };
};

export default rotatePdf;
