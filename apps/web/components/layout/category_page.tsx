import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ToolsBrowser } from '@/components/landing/tools_browser';
import { getCategory } from '@/lib/tools/categories';
import { getToolsByCategory } from '@/lib/tools/registry';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbJsonLd } from '@/lib/seo/structured_data';
import type { ToolCategoryId } from '@/lib/tools/tool_types';

export function categoryMetadata(id: ToolCategoryId): Metadata {
  const category = getCategory(id);
  if (!category) return {};
  return buildMetadata({
    title: category.seo.title,
    description: category.seo.description,
    path: `/${category.slug}`,
    keywords: category.seo.keywords,
  });
}

export function CategoryPage({ id }: { id: ToolCategoryId }) {
  const category = getCategory(id);
  if (!category) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: 'Tools', path: '/' },
              { name: category.name, path: `/${category.slug}` },
            ]),
          ),
        }}
      />
      <ToolsBrowser
        title={category.name}
        description={category.description}
        groups={[{ category, tools: getToolsByCategory(id) }]}
        showGroupHeadings={false}
      />
    </>
  );
}
