import type { ToolCategory, ToolCategoryId } from './tool_types';
import { TOOL_CATEGORY_IDS } from './tool_types';

export const TOOL_CATEGORIES: readonly ToolCategory[] = [
  {
    id: 'pdf',
    name: 'PDF Tools',
    slug: 'pdf',
    tagline: 'Merge, split, convert and secure PDFs',
    description:
      'Work with PDF files directly in your browser. Merge, split, compress, rotate and convert without uploading anything.',
    icon: 'FileText',
    seo: {
      title: 'PDF Tools',
      description:
        'Free PDF tools that run in your browser. Merge, split, compress, rotate and convert PDF files with no upload and no sign-up.',
      keywords: ['pdf tools', 'merge pdf', 'split pdf', 'compress pdf', 'pdf converter'],
    },
  },
  {
    id: 'image',
    name: 'Image Tools',
    slug: 'image',
    tagline: 'Compress, resize, crop and convert images',
    description:
      'Edit and convert images locally. Compress for the web, resize for a platform, or change format between JPG, PNG and WebP.',
    icon: 'Image',
    seo: {
      title: 'Image Tools',
      description:
        'Free image tools that run in your browser. Compress, resize, crop and convert images between JPG, PNG and WebP.',
      keywords: ['image tools', 'compress image', 'resize image', 'image converter', 'webp'],
    },
  },
  {
    id: 'video',
    name: 'Video Tools',
    slug: 'video',
    tagline: 'Compress, trim and convert video',
    description:
      'Trim, compress and convert video without an upload. Heavy work runs on WebAssembly inside your own browser.',
    icon: 'Video',
    seo: {
      title: 'Video Tools',
      description:
        'Free video tools that run in your browser. Compress, trim, resize and convert video files without uploading them.',
      keywords: ['video tools', 'compress video', 'trim video', 'video converter'],
    },
  },
  {
    id: 'audio',
    name: 'Audio Tools',
    slug: 'audio',
    tagline: 'Convert, trim and extract audio',
    description:
      'Convert between audio formats, trim clips and pull audio out of video, all locally in your browser.',
    icon: 'AudioLines',
    seo: {
      title: 'Audio Tools',
      description:
        'Free audio tools that run in your browser. Convert, trim and extract audio without uploading your files.',
      keywords: ['audio tools', 'audio converter', 'trim audio', 'extract audio'],
    },
  },
  {
    id: 'text',
    name: 'Text Tools',
    slug: 'text',
    tagline: 'Count, clean, convert, compare and format text',
    description:
      'Everyday text utilities: word and character counts, case conversion, cleanup, sorting, splitting, diffing and Markdown formatting.',
    icon: 'Type',
    seo: {
      title: 'Text Tools',
      description:
        'Free text tools that run in your browser. Count words, convert case, clean up text, find and replace, compare versions and format Markdown.',
      keywords: ['text tools', 'word counter', 'case converter', 'text diff', 'slug generator'],
    },
  },
  {
    id: 'developer',
    name: 'Developer Tools',
    slug: 'developer',
    tagline: 'Format, validate, convert, encode and inspect',
    description:
      'The utilities you reach for while building: code formatting, JSON, YAML, CSV, Base64, URL encoding, hashes, UUIDs, JWTs and test data.',
    icon: 'Code',
    seo: {
      title: 'Developer Tools',
      description:
        'Free developer tools that run in your browser. Format code and JSON, convert JSON to YAML or CSV, encode Base64, decode JWTs, generate hashes and test data.',
      keywords: [
        'developer tools',
        'code formatter',
        'json formatter',
        'base64 encoder',
        'jwt decoder',
        'hash generator',
      ],
    },
  },
  {
    id: 'converters',
    name: 'Converters',
    slug: 'converters',
    tagline: 'Units, time, currency and data sizes',
    description:
      'Quick, accurate conversions for units, temperature, length, weight, data sizes and time zones.',
    icon: 'ArrowLeftRight',
    seo: {
      title: 'Converters',
      description:
        'Free online converters for units, temperature, length, weight, data sizes, time zones and currency.',
      keywords: ['unit converter', 'temperature converter', 'data converter', 'time converter'],
    },
  },
  {
    id: 'utilities',
    name: 'Utilities',
    slug: 'utilities',
    tagline: 'Generators, timers and everyday helpers',
    description:
      'Small helpers that save a search: QR codes, strong passwords, random data, timers and a calculator.',
    icon: 'Wrench',
    seo: {
      title: 'Utilities',
      description:
        'Free online utilities that run in your browser: QR code generator, password generator, random generator, timers and a calculator.',
      keywords: ['qr generator', 'password generator', 'random generator', 'online timer'],
    },
  },
  {
    id: 'ai',
    name: 'AI Tools',
    slug: 'ai',
    tagline: 'Clean up what AI generators leave behind',
    description: 'Tools built around what AI generated images and video need next.',
    icon: 'Sparkles',
    seo: {
      title: 'AI Tools',
      description: 'Free AI focused tools that run entirely in your browser, with nothing uploaded.',
      keywords: ['ai tools', 'remove ai watermark'],
    },
  },
  {
    id: 'math',
    name: 'Math Tools',
    slug: 'math',
    tagline: 'Calculate, graph and work with matrices',
    description:
      'Calculators for everyday arithmetic, scientific and programmer work, plus 2D and 3D graphing and matrix operations, all computed locally in your browser.',
    icon: 'Sigma',
    seo: {
      title: 'Math Tools',
      description:
        'Free math tools that run in your browser: a basic and scientific calculator, a graphing and 3D graphing calculator, a programmer calculator and a matrix calculator.',
      keywords: ['calculator', 'scientific calculator', 'graphing calculator', 'matrix calculator'],
    },
  },
] as const;

const CATEGORY_BY_ID = new Map<ToolCategoryId, ToolCategory>(
  TOOL_CATEGORIES.map((category) => [category.id, category]),
);

export function getCategory(id: string): ToolCategory | undefined {
  return CATEGORY_BY_ID.get(id as ToolCategoryId);
}

export function getCategoryOrThrow(id: ToolCategoryId): ToolCategory {
  const category = CATEGORY_BY_ID.get(id);
  if (!category) throw new Error(`Unknown tool category: ${id}`);
  return category;
}

export { TOOL_CATEGORY_IDS };
