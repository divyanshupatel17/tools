import type { Tool, ToolCategory } from '@/lib/tools/tool_types';
import { SITE_NAME, SITE_URL, absoluteUrl } from './site';
import { toolPath } from '@/lib/tools/registry';

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
    '@type': 'SoftwareApplication',
    name: tool.name,
    description: tool.seo.description,
    url: absoluteUrl(toolPath(tool)),
    applicationCategory: category.name,
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}
