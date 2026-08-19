import { safeFileName } from '@tools/file_utils';

export interface ZipEntry {
  file_name: string;
  bytes: Uint8Array;
}

/** Stores entries uncompressed: the payloads are already-compressed PDFs and images. */
export async function zipFiles(entries: readonly ZipEntry[]): Promise<Blob> {
  const { zip } = await import('fflate');

  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const entry of entries) {
    let name = safeFileName(entry.file_name, 'file');
    let suffix = 1;
    while (used.has(name)) {
      name = safeFileName(`${suffix}-${entry.file_name}`, `file-${suffix}`);
      suffix += 1;
    }
    used.add(name);
    files[name] = entry.bytes;
  }

  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 0 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });

  return new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
}
