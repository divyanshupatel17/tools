import type { MetadataRoute } from 'next';
import { TOOL_CATEGORIES } from '@/lib/tools/categories';
import { TOOLS, toolPath } from '@/lib/tools/registry';
import { absoluteUrl } from '@/lib/seo/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/all'), lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    ...TOOL_CATEGORIES.map((category) => ({
      url: absoluteUrl(`/${category.slug}`),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...TOOLS.map((tool) => ({
      url: absoluteUrl(toolPath(tool)),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: tool.popular ? 0.7 : 0.6,
    })),
  ];
}
