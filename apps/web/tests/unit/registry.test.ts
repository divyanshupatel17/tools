import { describe, expect, it } from 'vitest';
import { TOOL_CATEGORIES } from '@/lib/tools/categories';
import {
  TOOLS,
  getTool,
  getToolBySlug,
  getToolsByCategory,
  searchTools,
  toolPath,
} from '@/lib/tools/registry';
import { getCategorySections, groupBySection } from '@/lib/tools/sections';
import { isToolCategoryId } from '@/lib/tools/tool_types';
import { PROCESSORS, hasProcessor } from '@/lib/processing/processor_registry';
import { hasWorkspace } from '@/lib/processing/workspace_ids';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('tool registry', () => {
  it('gives every tool a known category and a URL-safe slug', () => {
    for (const tool of TOOLS) {
      expect(isToolCategoryId(tool.category)).toBe(true);
      expect(tool.slug).toMatch(SLUG_PATTERN);
    }
  });

  it('keeps every tool slug and processor id globally unique', () => {
    const paths = TOOLS.map(toolPath);
    const slugs = TOOLS.map((tool) => tool.slug);
    const processors = TOOLS.map((tool) => tool.processor);
    expect(new Set(paths).size).toBe(TOOLS.length);
    expect(new Set(slugs).size).toBe(TOOLS.length);
    expect(new Set(processors).size).toBe(TOOLS.length);
  });

  it('never lets a tool slug collide with a category slug', () => {
    const categorySlugs = new Set(TOOL_CATEGORIES.map((category) => category.slug));
    for (const tool of TOOLS) {
      expect(categorySlugs.has(tool.slug), `"${tool.slug}" collides with a category slug`).toBe(
        false,
      );
    }
  });

  it('places at least one tool in every category', () => {
    for (const category of TOOL_CATEGORIES) {
      expect(getToolsByCategory(category.id).length).toBeGreaterThan(0);
    }
  });

  it('resolves a tool from its category and slug', () => {
    expect(getTool('pdf', 'merge-pdf')?.name).toBe('Merge PDF');
    expect(getTool('pdf', 'does-not-exist')).toBeUndefined();
  });

  it('resolves a tool from its slug alone, for the flat /{slug} route', () => {
    expect(getToolBySlug('merge-pdf')?.category).toBe('pdf');
    expect(getToolBySlug('does-not-exist')).toBeUndefined();
  });

  it('gives every tool a canonical flat URL', () => {
    expect(toolPath(getTool('pdf', 'merge-pdf')!)).toBe('/merge-pdf');
  });

  it('ranks an exact name match first in search', () => {
    expect(searchTools('merge pdf')[0]?.slug).toBe('merge-pdf');
    expect(searchTools('')).toHaveLength(0);
  });

  it('backs every available tool with a processor and a workspace', () => {
    for (const tool of TOOLS.filter((entry) => entry.status === 'available')) {
      expect(hasProcessor(tool.processor), `${tool.processor} has no processor`).toBe(true);
      expect(hasWorkspace(tool.processor), `${tool.processor} has no workspace`).toBe(true);
    }
  });

  it('puts every tool of a sectioned category into a declared section', () => {
    for (const category of TOOL_CATEGORIES) {
      const sections = getCategorySections(category.id);
      if (sections.length === 0) continue;

      const ids = new Set(sections.map((section) => section.id));
      for (const tool of getToolsByCategory(category.id)) {
        expect(ids.has(tool.section ?? ''), `${toolPath(tool)} has no section`).toBe(true);
      }
    }
  });

  it('lists every tool exactly once when grouped by section', () => {
    const tools = getToolsByCategory('pdf');
    const grouped = groupBySection('pdf', tools).flatMap((entry) => entry.tools);
    expect(grouped.map(toolPath).sort()).toEqual(tools.map(toolPath).sort());
  });

  it('registers no processor without a matching tool', () => {
    const ids = new Set(TOOLS.map((tool) => tool.processor));
    for (const id of Object.keys(PROCESSORS)) expect(ids.has(id)).toBe(true);
  });
});
