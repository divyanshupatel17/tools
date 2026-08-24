import type { Tool, ToolCategory, ToolCategoryId } from '@/lib/tools/tool_types';
import { SITE_NAME, SITE_URL, absoluteUrl } from './site';
import { toolPath } from '@/lib/tools/registry';

/**
 * schema.org/Google expect applicationCategory to be one of a known set of values (e.g.
 * "UtilitiesApplication"), not free text like a category display name ("PDF Tools") — Google's
 * Rich Results Test flags the latter as an unrecognised category.
 */
const APPLICATION_CATEGORY: Record<ToolCategoryId, string> = {
  pdf: 'UtilitiesApplication',
  image: 'MultimediaApplication',
  video: 'MultimediaApplication',
  audio: 'MultimediaApplication',
  text: 'UtilitiesApplication',
  developer: 'DeveloperApplication',
  converters: 'UtilitiesApplication',
  utilities: 'UtilitiesApplication',
  ai: 'MultimediaApplication',
  math: 'EducationalApplication',
};

type JsonLd = Record<string, unknown>;

export function webSiteJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
  };
}

export function breadcrumbJsonLd(trail: readonly { name: string; path: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export function toolJsonLd(tool: Tool, category: ToolCategory): JsonLd {
  return {
    '@context': 'https://schema.org',
    // WebApplication (a SoftwareApplication subtype), not SoftwareApplication itself — these
    // tools run entirely in the browser rather than being installed.
    '@type': 'WebApplication',
    name: tool.name,
    description: tool.seo.description,
    url: absoluteUrl(toolPath(tool)),
    applicationCategory: APPLICATION_CATEGORY[category.id],
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}
