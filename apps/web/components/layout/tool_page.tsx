import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from './container';
import { RelatedToolsList } from '@/components/tool_card/related_tools_list';
import { ToolWorkspace } from '@/components/tool_workspace/tool_workspace';
import { getCategory } from '@/lib/tools/categories';
import { TOOLS, getRelatedTools, getToolBySlug, getToolsByCategory, toolPath } from '@/lib/tools/registry';
import { getCategorySections, groupBySection } from '@/lib/tools/sections';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbJsonLd, toolJsonLd } from '@/lib/seo/structured_data';

export function toolStaticParams(): { tool_slug: string }[] {
  return TOOLS.map((tool) => ({ tool_slug: tool.slug }));
}

export async function toolMetadata(params: Promise<{ tool_slug: string }>): Promise<Metadata> {
  const { tool_slug } = await params;
  const tool = getToolBySlug(tool_slug);
  if (!tool) return {};
  return buildMetadata({
    title: tool.seo.title,
    description: tool.seo.description,
    path: toolPath(tool),
    keywords: tool.seo.keywords,
    noindex: tool.status !== 'available',
  });
}

export async function ToolPage({ params }: { params: Promise<{ tool_slug: string }> }) {
  const { tool_slug } = await params;
  const tool = getToolBySlug(tool_slug);
  const category = tool ? getCategory(tool.category) : undefined;
  if (!tool || !category) notFound();

  const declaresSections = getCategorySections(category.id).length > 0;
  const sectioned = declaresSections
    ? groupBySection(category.id, getToolsByCategory(category.id))
    : toFlatGroup(getRelatedTools(tool));

  return (
    <>
      <Container className="pt-10 pb-16">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              breadcrumbJsonLd([
                { name: 'Tools', path: '/' },
                { name: category.name, path: `/${category.slug}` },
                { name: tool.name, path: toolPath(tool) },
              ]),
              toolJsonLd(tool, category),
            ]),
          }}
        />

        <nav aria-label="Breadcrumb" className="text-muted text-sm">
          <Link href="/" className="hover:text-foreground">
            Tools
          </Link>
          <span aria-hidden> / </span>
          <Link href={`/${category.slug}`} className="hover:text-foreground">
            {category.name}
          </Link>
        </nav>

        <header className="mt-3 max-w-2xl">
          <h1 className="font-hand text-4xl sm:text-5xl">{tool.name}</h1>
          <p className="text-muted mt-3">{tool.description}</p>
        </header>

        <div className="mt-8">
          <ToolWorkspace tool={tool} />
        </div>

        {sectioned.length > 0 && (
          <section className="mt-12">
            <h2 className="font-hand text-2xl">Related tools</h2>
            <div className="mt-4">
              <RelatedToolsList groups={sectioned} currentSlug={tool.slug} />
            </div>
          </section>
        )}
      </Container>
    </>
  );
}

// Wraps a flat tool list as one unnamed group so RelatedToolsList's column layout applies even without declared sections.
function toFlatGroup(tools: ReturnType<typeof getRelatedTools>) {
  return tools.length > 0 ? [{ section: { id: 'related', name: '', tagline: '' }, tools }] : [];
}
