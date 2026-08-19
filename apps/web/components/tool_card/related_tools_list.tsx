import Link from 'next/link';
import { toolPath } from '@/lib/tools/registry';
import type { SectionedTools } from '@/lib/tools/sections';
import type { Tool } from '@/lib/tools/tool_types';

/** One row: the current tool highlighted as the active page, a planned tool marked "Soon", or a link. */
function ToolRow({ tool, currentSlug }: { tool: Tool; currentSlug: string }) {
  if (tool.slug === currentSlug) {
    return (
      <span className="bg-brand/15 text-brand-strong -mx-2 flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-semibold">
        <span aria-hidden className="bg-brand-strong size-1.5 shrink-0 rounded-full" />
        {tool.name}
      </span>
    );
  }
  if (tool.status === 'planned') {
    return (
      <span className="text-muted/70 text-sm">
        {tool.name} <span className="text-muted/50">· Soon</span>
      </span>
    );
  }
  return (
    <Link href={toolPath(tool)} className="text-muted hover:text-brand text-sm transition-colors">
      {tool.name}
    </Link>
  );
}

/**
 * A dense, title only listing used on PDF tool pages: one column per section, no icons or
 * descriptions, since a full ToolCardGrid of 37 tools would repeat the whole PDF listing page.
 */
export function RelatedToolsList({
  groups,
  currentSlug,
}: {
  groups: readonly SectionedTools[];
  currentSlug: string;
}) {
  // A single surviving group (e.g. most of another category's tools got filtered out) has
  // nothing to spread across the 6 section columns below — with only one child, CSS grid still
  // gives it just a sixth of the width, wrapping long names onto two lines. Lay a lone group
  // out across the full width instead.
  if (groups.length === 1) {
    const tools = groups[0]?.tools ?? [];
    return (
      <ul className="border-border grid grid-cols-2 gap-x-6 gap-y-1.5 border-b pb-6 sm:grid-cols-3 lg:grid-cols-4">
        {tools.map((tool) => (
          <li key={tool.slug}>
            <ToolRow tool={tool} currentSlug={currentSlug} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="border-border grid grid-cols-2 gap-x-6 gap-y-6 border-b pb-6 sm:grid-cols-3 lg:grid-cols-6">
      {groups.map(({ section, tools }) => (
        <div key={section.id}>
          {section.name && (
            <h3 className="text-foreground/70 border-border/70 border-b pb-1.5 text-[11px] font-bold tracking-wider uppercase">
              {section.name}
            </h3>
          )}
          <ul className="mt-2.5 space-y-1.5">
            {tools.map((tool) => (
              <li key={tool.slug}>
                <ToolRow tool={tool} currentSlug={currentSlug} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
