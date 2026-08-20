import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension } from '@tools/file_utils';
import { parseIpynbToBlocks } from '@/lib/pdf/ipynb_blocks';
import { renderBlocksToPdf, type TypesetPageSize } from '@/lib/pdf/pdf_typeset';
import { zipFiles } from '@/lib/browser/zip';

export interface IpynbToPdfOptions {
  page_size?: TypesetPageSize;
  margin?: number;
  font_size?: number;
  file_name?: string;
}

const ipynbToPdf: ToolProcessor<IpynbToPdfOptions> = async (input, context) => {
  if (input.files.length === 0) throw new ProcessorError('missing_file', 'Add at least one notebook.');

  const typesetOptions = {
    pageSize: input.options.page_size ?? 'a4',
    marginPt: input.options.margin ?? 54,
    fontSize: input.options.font_size ?? 11,
  };

  const parts: Array<{ name: string; bytes: Uint8Array }> = [];

  for (let index = 0; index < input.files.length; index += 1) {
    if (context.signal.aborted) throw new ProcessorError('aborted', 'Conversion cancelled.');
    const file = input.files[index]!;
    context.on_progress?.({
      ratio: index / input.files.length,
      label: `Typesetting ${index + 1} of ${input.files.length}`,
    });

    const json = await file.text();
    let blocks: ReturnType<typeof parseIpynbToBlocks>;
    try {
      blocks = parseIpynbToBlocks(json);
    } catch (error) {
      throw new ProcessorError(
        'invalid_notebook',
        error instanceof Error ? `${file.name}: ${error.message}` : `${file.name} could not be read.`,
      );
    }

    const bytes = await renderBlocksToPdf(blocks, typesetOptions);
    parts.push({ name: replaceExtension(file.name, 'pdf'), bytes });
  }

  context.on_progress?.({ ratio: 1, label: 'Done' });

  if (parts.length === 1) {
    const part = parts[0]!;
    const base = input.options.file_name?.trim();
    return {
      artifacts: [
        {
          file_name: base ? `${base}.pdf` : part.name,
          mime_type: 'application/pdf',
          blob: new Blob([new Uint8Array(part.bytes)], { type: 'application/pdf' }),
        },
      ],
      text: String(parts.length),
    };
  }

  const zip = await zipFiles(parts.map((part) => ({ file_name: part.name, bytes: part.bytes })));
  const base = input.options.file_name?.trim();

  return {
    // The zip is the primary download; each notebook's own PDF follows in file order so a
    // workspace can offer a per-row "View" without re-parsing or unzipping anything.
    artifacts: [
      {
        file_name: `${base ? base : 'notebooks'}.zip`,
        mime_type: 'application/zip',
        blob: zip,
      },
      ...parts.map((part) => ({
        file_name: part.name,
        mime_type: 'application/pdf',
        blob: new Blob([new Uint8Array(part.bytes)], { type: 'application/pdf' }),
      })),
    ],
    text: String(parts.length),
  };
};

export default ipynbToPdf;
