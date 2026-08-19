import { fileExtension, formatBytes, safeFileName } from './naming';

export interface FileRule {
  /** Accepted MIME types; `image/*` style wildcards are supported. Empty means any. */
  mime_types?: readonly string[];
  extensions?: readonly string[];
  max_bytes?: number;
  max_files?: number;
}

export interface FileValidation {
  ok: boolean;
  errors: string[];
}

function mimeMatches(type: string, pattern: string): boolean {
  return pattern.endsWith('/*') ? type.startsWith(pattern.slice(0, -1)) : type === pattern;
}

export function validateFile(file: File, rule: FileRule): FileValidation {
  const errors: string[] = [];
  const name = safeFileName(file.name);
  const extensions = rule.extensions ?? [];
  const mimeTypes = rule.mime_types ?? [];

  if (file.size === 0) {
    errors.push(`${name} is empty.`);
  }
  if (rule.max_bytes !== undefined && file.size > rule.max_bytes) {
    errors.push(
      `${name} is ${formatBytes(file.size)}; the limit is ${formatBytes(rule.max_bytes)}.`,
    );
  }

  const extensionOk = extensions.length === 0 || extensions.includes(fileExtension(name));
  // Some browsers report an empty MIME type; fall back to the extension check in that case.
  const mimeOk =
    mimeTypes.length === 0 ||
    (file.type === ''
      ? extensions.length > 0 && extensionOk
      : mimeTypes.some((pattern) => mimeMatches(file.type, pattern)));

  if (!extensionOk || !mimeOk) {
    errors.push(`${name} is not a supported file type.`);
  }

  return { ok: errors.length === 0, errors };
}

export function validateFiles(files: readonly File[], rule: FileRule): FileValidation {
  const errors: string[] = [];
  if (rule.max_files !== undefined && files.length > rule.max_files) {
    errors.push(`Select at most ${rule.max_files} file${rule.max_files === 1 ? '' : 's'}.`);
  }
  for (const file of files) errors.push(...validateFile(file, rule).errors);
  return { ok: errors.length === 0, errors };
}
