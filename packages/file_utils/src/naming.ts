const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

const ILLEGAL_NAME_CHARS = '<>:"|?*';

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : decimals)} ${UNITS[index]}`;
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Uploaded file names are untrusted: drop directory components, control chars and path metacharacters. */
export function safeFileName(name: string, fallback = 'file'): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = Array.from(base)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 31 && code !== 127 && !ILLEGAL_NAME_CHARS.includes(char);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
}

export function replaceExtension(name: string, extension: string): string {
  const safe = safeFileName(name);
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  return `${stem}.${extension.replace(/^\./, '')}`;
}
