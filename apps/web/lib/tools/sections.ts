import type { Tool, ToolCategoryId, ToolSection } from './tool_types';

/**
 * Sections split a large category into blocks a person can scan. Only categories big
 * enough to need them are listed; everything else renders as one flat grid.
 * Order here is the order on the page.
 */
export const CATEGORY_SECTIONS: Partial<Record<ToolCategoryId, readonly ToolSection[]>> = {
  pdf: [
    {
      id: 'organize',
      name: 'Organize PDF',
      tagline: 'Combine, separate and rearrange pages.',
    },
    {
      id: 'optimize',
      name: 'Optimize PDF',
      tagline: 'Make a file smaller, cleaner or readable again.',
    },
    {
      id: 'convert-to',
      name: 'Convert to PDF',
      tagline: 'Turn images, documents and markup into a PDF.',
    },
    {
      id: 'convert-from',
      name: 'Convert from PDF',
      tagline: 'Get a PDF back out as something you can edit.',
    },
    {
      id: 'edit',
      name: 'Edit PDF',
      tagline: 'Change how the pages look before you send them.',
    },
    {
      id: 'security',
      name: 'PDF Security',
      tagline: 'Passwords, signatures and what a file gives away.',
    },
  ],
  audio: [
    {
      id: 'convert-compress',
      name: 'Convert & Compress',
      tagline: 'Change format or shrink the file down.',
    },
    {
      id: 'edit-combine',
      name: 'Edit & Combine',
      tagline: 'Cut, join, reshape and clean up a track.',
    },
    {
      id: 'record-manage',
      name: 'Record & Manage',
      tagline: 'Capture audio and edit what it carries.',
    },
  ],
  image: [
    {
      id: 'optimize',
      name: 'Optimize Image',
      tagline: 'Make a picture smaller, or the right shape for where it is going.',
    },
    {
      id: 'convert',
      name: 'Convert Image',
      tagline: 'Move between JPG, PNG, WebP, AVIF and the rest.',
    },
    {
      id: 'edit',
      name: 'Edit & Create',
      tagline: 'Draw on it, caption it, frame it or build something new out of it.',
    },
    {
      id: 'privacy',
      name: 'Privacy & Analysis',
      tagline: 'Hide what should not be seen and read what a photo carries.',
    },
    {
      id: 'extract',
      name: 'Extract',
      tagline: 'Get the text or the colours back out of a picture.',
    },
  ],
  text: [
    {
      id: 'count-analyze',
      name: 'Count & Analyze',
      tagline: 'Counts, frequency and the shape of what you wrote.',
    },
    {
      id: 'convert-transform',
      name: 'Convert & Transform',
      tagline: 'Change the case, order or shape of the text itself.',
    },
    {
      id: 'find-clean',
      name: 'Find & Clean',
      tagline: 'Find something specific, or tidy up what is already there.',
    },
    {
      id: 'split-combine',
      name: 'Split & Combine',
      tagline: 'Break a block apart or stitch a list back together.',
    },
    {
      id: 'compare-format',
      name: 'Compare & Format',
      tagline: 'Line two versions up, or lay Markdown out cleanly.',
    },
  ],
  video: [
    {
      id: 'edit-optimize',
      name: 'Edit & Optimize',
      tagline: 'Shrink, reshape or cut a clip down to size.',
    },
    {
      id: 'convert-create',
      name: 'Convert & Create',
      tagline: 'Change format, or turn a clip into a GIF.',
    },
    {
      id: 'record',
      name: 'Record',
      tagline: 'Capture your screen, camera or both.',
    },
  ],
  developer: [
    {
      id: 'code',
      name: 'Code',
      tagline: 'Format, shrink and compare source code.',
    },
    {
      id: 'data',
      name: 'Data',
      tagline: 'JSON, YAML, XML, CSV and Base64, moved between shapes.',
    },
    {
      id: 'web-url',
      name: 'Web & URL',
      tagline: 'HTML and URLs, encoded, decoded and taken apart.',
    },
    {
      id: 'encoding-utilities',
      name: 'Encoding & Utilities',
      tagline: 'Hashes, tokens, identifiers and query strings.',
    },
    {
      id: 'api-reference',
      name: 'API & Reference',
      tagline: 'Look up a status code or a file type without leaving the tab.',
    },
    {
      id: 'generate',
      name: 'Generate',
      tagline: 'Test data and placeholder text for building with.',
    },
  ],
};

/** A pointer to a tool that lives in another category, shown at the foot of a listing. */
export interface CategoryCrossLink {
  category: ToolCategoryId;
  slug: string;
}

export interface CategoryCrossLinkGroup {
  name: string;
  links: readonly CategoryCrossLink[];
}

/**
 * Jobs a visitor looks for in one category whose only implementation lives in another. These
 * point at real registry entries and render as ordinary tool tiles: giving them their own
 * registry entries would mint a second canonical URL competing with the real page for the
 * same search.
 */
export const CATEGORY_CROSS_LINKS: Partial<Record<ToolCategoryId, CategoryCrossLinkGroup>> = {
  image: {
    name: 'PDF Tools',
    links: [
      { category: 'pdf', slug: 'jpg-to-pdf' },
      { category: 'pdf', slug: 'pdf-to-jpg' },
    ],
  },
};

export function getCategoryCrossLinks(
  category: ToolCategoryId,
): CategoryCrossLinkGroup | undefined {
  return CATEGORY_CROSS_LINKS[category];
}

export interface SectionedTools {
  section: ToolSection;
  tools: readonly Tool[];
}

export function getCategorySections(category: ToolCategoryId): readonly ToolSection[] {
  return CATEGORY_SECTIONS[category] ?? [];
}

/**
 * Splits a category's tools into its declared sections. Anything without a section, or in
 * a category that declares none, comes back in a single unnamed block so no tool is ever
 * silently dropped from a listing.
 */
export function groupBySection(
  category: ToolCategoryId,
  tools: readonly Tool[],
): readonly SectionedTools[] {
  const sections = getCategorySections(category);
  if (sections.length === 0) return [];

  const grouped = sections
    .map((section) => ({
      section,
      tools: tools.filter((tool) => tool.section === section.id),
    }))
    .filter((entry) => entry.tools.length > 0);

  const placed = new Set(grouped.flatMap((entry) => entry.tools.map((tool) => tool.slug)));
  const rest = tools.filter((tool) => !placed.has(tool.slug));
  if (rest.length > 0) {
    grouped.push({ section: { id: 'more', name: 'More', tagline: '' }, tools: rest });
  }

  return grouped;
}
