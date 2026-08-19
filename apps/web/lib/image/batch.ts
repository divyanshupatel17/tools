import type { ProcessorArtifact, ProcessorContext, ProcessorOutput } from '@tools/tool_engine';
import { zipFiles } from '../browser/zip';

/**
 * Runs `step` over every input file with progress, collecting artifacts. More than one
 * result is zipped through lib/browser/zip.ts so a batch is a single download, unless
 * `auto_zip: false` is passed, in which case every artifact is returned individually. A
 * single result is always returned on its own. Honours `signal` between files.
 */
export async function runBatch(
  files: readonly File[],
  step: (file: File, index: number) => Promise<ProcessorArtifact>,
  context: ProcessorContext,
  options?: { zip_name?: string; auto_zip?: boolean },
): Promise<ProcessorOutput> {
  const artifacts: ProcessorArtifact[] = [];

  for (let index = 0; index < files.length; index += 1) {
    if (context.signal.aborted)
      throw new DOMException('The operation was cancelled.', 'AbortError');

    context.on_progress?.({ ratio: index / files.length, label: files[index]!.name });
    artifacts.push(await step(files[index]!, index));
  }

  context.on_progress?.({ ratio: 1 });

  if (artifacts.length <= 1 || options?.auto_zip === false) {
    return { artifacts };
  }

  const entries = await Promise.all(
    artifacts.map(async (artifact) => ({
      file_name: artifact.file_name,
      bytes: new Uint8Array(await artifact.blob.arrayBuffer()),
    })),
  );
  const zipBlob = await zipFiles(entries);

  return {
    artifacts: [
      {
        file_name: options?.zip_name ?? 'images.zip',
        mime_type: 'application/zip',
        blob: zipBlob,
      },
    ],
  };
}
