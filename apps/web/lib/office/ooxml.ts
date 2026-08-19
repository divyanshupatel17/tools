'use client';

/**
 * DOCX/PPTX/XLSX are all "OOXML" packages: a ZIP archive of XML parts plus a
 * `[Content_Types].xml` index and `_rels` relationship files. This is the shared ZIP layer
 * every format-specific writer/reader in this directory builds on — fflate does the actual
 * compression, this just converts between a flat `{ path: string | Uint8Array }` map and bytes.
 */

export type OoxmlFiles = Record<string, string | Uint8Array>;

export async function writeOoxmlPackage(files: OoxmlFiles): Promise<Uint8Array> {
  const { strToU8, zip } = await import('fflate');

  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path] = typeof content === 'string' ? strToU8(content) : content;
  }

  return new Promise((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

export async function readOoxmlPackage(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  const { unzip } = await import('fflate');
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

export async function readOoxmlText(
  files: Record<string, Uint8Array>,
  path: string,
): Promise<string | undefined> {
  const bytes = files[path];
  if (!bytes) return undefined;
  const { strFromU8 } = await import('fflate');
  return strFromU8(bytes);
}

/** Escapes text for use inside XML element content or attribute values. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Very small, forgiving XML text extractor: strips all tags and decodes the handful of named
 * entities OOXML actually uses, for reading back the office formats this app writes (and a
 * reasonable subset of ones it doesn't). Not a real XML parser — no nesting awareness, no
 * namespaces — which is enough for the flat runs-of-text OOXML documents use. */
export function stripXmlTags(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
