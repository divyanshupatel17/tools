export type MimeCategory = 'Images' | 'Documents' | 'Web/Markup' | 'Audio/Video' | 'Archives';

export interface MimeEntry {
  extension: string;
  mimeType: string;
  category: MimeCategory;
  description: string;
  standard: string;
  compressed: boolean;
  binary: boolean;
  charset: string | null;
}

export const CATEGORY_ORDER: MimeCategory[] = ['Images', 'Documents', 'Web/Markup', 'Audio/Video', 'Archives'];

export const MIME_TYPES: MimeEntry[] = [
  // Images
  { extension: 'jpg', mimeType: 'image/jpeg', category: 'Images', description: 'JPEG Image', standard: 'ISO/IEC 10918', compressed: true, binary: true, charset: null },
  { extension: 'jpeg', mimeType: 'image/jpeg', category: 'Images', description: 'JPEG Image', standard: 'ISO/IEC 10918', compressed: true, binary: true, charset: null },
  { extension: 'png', mimeType: 'image/png', category: 'Images', description: 'Portable Network Graphics', standard: 'RFC 2083', compressed: true, binary: true, charset: null },
  { extension: 'gif', mimeType: 'image/gif', category: 'Images', description: 'GIF Image', standard: 'CompuServe GIF89a', compressed: true, binary: true, charset: null },
  { extension: 'svg', mimeType: 'image/svg+xml', category: 'Images', description: 'SVG Image', standard: 'W3C SVG 1.1', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'webp', mimeType: 'image/webp', category: 'Images', description: 'WebP Image', standard: 'Google WebP Spec', compressed: true, binary: true, charset: null },
  { extension: 'bmp', mimeType: 'image/bmp', category: 'Images', description: 'Bitmap Image', standard: 'Microsoft BMP', compressed: false, binary: true, charset: null },
  { extension: 'ico', mimeType: 'image/x-icon', category: 'Images', description: 'Icon Image', standard: 'Microsoft ICO', compressed: false, binary: true, charset: null },
  { extension: 'tiff', mimeType: 'image/tiff', category: 'Images', description: 'TIFF Image', standard: 'Adobe TIFF 6.0', compressed: false, binary: true, charset: null },
  { extension: 'tif', mimeType: 'image/tiff', category: 'Images', description: 'TIFF Image', standard: 'Adobe TIFF 6.0', compressed: false, binary: true, charset: null },
  { extension: 'avif', mimeType: 'image/avif', category: 'Images', description: 'AVIF Image', standard: 'AOM AVIF Spec', compressed: true, binary: true, charset: null },

  // Documents
  { extension: 'pdf', mimeType: 'application/pdf', category: 'Documents', description: 'PDF Document', standard: 'ISO 32000', compressed: false, binary: true, charset: null },
  { extension: 'txt', mimeType: 'text/plain', category: 'Documents', description: 'Plain Text', standard: 'N/A', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'json', mimeType: 'application/json', category: 'Documents', description: 'JSON Document', standard: 'RFC 8259', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'xml', mimeType: 'application/xml', category: 'Documents', description: 'XML Document', standard: 'W3C XML 1.0', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'csv', mimeType: 'text/csv', category: 'Documents', description: 'CSV File', standard: 'RFC 4180', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'yaml', mimeType: 'application/yaml', category: 'Documents', description: 'YAML File', standard: 'YAML 1.2 Spec', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'yml', mimeType: 'application/yaml', category: 'Documents', description: 'YAML File', standard: 'YAML 1.2 Spec', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'jsonld', mimeType: 'application/ld+json', category: 'Documents', description: 'JSON LD File', standard: 'W3C JSON LD 1.1', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'md', mimeType: 'text/markdown', category: 'Documents', description: 'Markdown File', standard: 'CommonMark', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'rtf', mimeType: 'application/rtf', category: 'Documents', description: 'RTF Document', standard: 'Microsoft RTF', compressed: false, binary: false, charset: 'UTF-8' },

  // Web / Markup
  { extension: 'html', mimeType: 'text/html', category: 'Web/Markup', description: 'HTML Document', standard: 'WHATWG HTML Living Standard', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'htm', mimeType: 'text/html', category: 'Web/Markup', description: 'HTML Document', standard: 'WHATWG HTML Living Standard', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'css', mimeType: 'text/css', category: 'Web/Markup', description: 'CSS Stylesheet', standard: 'W3C CSS', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'js', mimeType: 'text/javascript', category: 'Web/Markup', description: 'JavaScript File', standard: 'ECMA 262', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'php', mimeType: 'application/x-php', category: 'Web/Markup', description: 'PHP Script', standard: 'N/A', compressed: false, binary: false, charset: 'UTF-8' },
  { extension: 'rss', mimeType: 'application/rss+xml', category: 'Web/Markup', description: 'RSS Feed', standard: 'RSS 2.0 Spec', compressed: false, binary: false, charset: 'UTF-8' },

  // Audio / Video
  { extension: 'mp4', mimeType: 'video/mp4', category: 'Audio/Video', description: 'MP4 Video', standard: 'ISO/IEC 14496-14', compressed: true, binary: true, charset: null },
  { extension: 'mp3', mimeType: 'audio/mpeg', category: 'Audio/Video', description: 'MP3 Audio', standard: 'ISO/IEC 11172-3', compressed: true, binary: true, charset: null },
  { extension: 'wav', mimeType: 'audio/wav', category: 'Audio/Video', description: 'WAV Audio', standard: 'Microsoft/IBM RIFF', compressed: false, binary: true, charset: null },
  { extension: 'm4a', mimeType: 'audio/mp4', category: 'Audio/Video', description: 'M4A Audio', standard: 'ISO/IEC 14496-14', compressed: true, binary: true, charset: null },
  { extension: 'aac', mimeType: 'audio/aac', category: 'Audio/Video', description: 'AAC Audio', standard: 'ISO/IEC 13818-7', compressed: true, binary: true, charset: null },
  { extension: 'webm', mimeType: 'video/webm', category: 'Audio/Video', description: 'WebM Video', standard: 'WebM Project Spec', compressed: true, binary: true, charset: null },
  { extension: 'ogg', mimeType: 'audio/ogg', category: 'Audio/Video', description: 'OGG Audio', standard: 'RFC 3533', compressed: true, binary: true, charset: null },
  { extension: 'flac', mimeType: 'audio/flac', category: 'Audio/Video', description: 'FLAC Audio', standard: 'IETF FLAC Format', compressed: true, binary: true, charset: null },
  { extension: 'mkv', mimeType: 'video/x-matroska', category: 'Audio/Video', description: 'MKV Video', standard: 'Matroska Spec', compressed: true, binary: true, charset: null },

  // Archives
  { extension: 'zip', mimeType: 'application/zip', category: 'Archives', description: 'ZIP Archive', standard: 'PKWARE APPNOTE', compressed: true, binary: true, charset: null },
  { extension: 'rar', mimeType: 'application/x-rar-compressed', category: 'Archives', description: 'RAR Archive', standard: 'RARLAB (proprietary)', compressed: true, binary: true, charset: null },
  { extension: '7z', mimeType: 'application/x-7z-compressed', category: 'Archives', description: '7Z Archive', standard: '7 Zip / LZMA SDK', compressed: true, binary: true, charset: null },
  { extension: 'tar', mimeType: 'application/x-tar', category: 'Archives', description: 'TAR Archive', standard: 'POSIX.1-1988', compressed: false, binary: true, charset: null },
  { extension: 'gz', mimeType: 'application/gzip', category: 'Archives', description: 'Gzip Archive', standard: 'RFC 1952', compressed: true, binary: true, charset: null },
  { extension: 'bz2', mimeType: 'application/x-bzip2', category: 'Archives', description: 'Bzip2 Archive', standard: 'bzip2 Format Spec', compressed: true, binary: true, charset: null },
  { extension: 'xz', mimeType: 'application/x-xz', category: 'Archives', description: 'XZ Archive', standard: '.xz Format Spec', compressed: true, binary: true, charset: null },
  { extension: 'iso', mimeType: 'application/x-iso9660-image', category: 'Archives', description: 'ISO Image', standard: 'ISO 9660', compressed: false, binary: true, charset: null },
  { extension: 'cab', mimeType: 'application/vnd.ms-cab-compressed', category: 'Archives', description: 'CAB Archive', standard: 'Microsoft Cabinet Format', compressed: true, binary: true, charset: null },
];

export function findByExtension(extension: string): MimeEntry | undefined {
  const normalized = extension.trim().replace(/^\./, '').toLowerCase();
  return MIME_TYPES.find((entry) => entry.extension === normalized);
}

export function findByMimeType(mimeType: string): MimeEntry | undefined {
  const normalized = mimeType.trim().toLowerCase();
  return MIME_TYPES.find((entry) => entry.mimeType.toLowerCase() === normalized);
}
