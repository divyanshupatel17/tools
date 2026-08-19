import Link from 'next/link';
import { DoodleField } from './doodle_field';
import { SectionHeading } from './section_heading';
import { ToolTile } from './tool_tile';
import { Art } from '@/components/ui/art';
import { getCategoryCrossLinks, groupBySection } from '@/lib/tools/sections';
import type { CategoryCrossLinkGroup } from '@/lib/tools/sections';
import { getTool } from '@/lib/tools/registry';
import type { Tool, ToolCategory, ToolSection } from '@/lib/tools/tool_types';

export interface ToolGroup {
  category: ToolCategory;
  tools: readonly Tool[];
}

/**
 * The painted browse page behind "All Tools" and every category, so the listings
 * share the landing page's paper world instead of a plain grid.
 *
 * Tiles carry the name only. With this many tools a description on every card turns
 * the page into a wall of prose you have to read to skim; it moves to a hover hint.
 */
export function ToolsBrowser({
  title,
  description,
  groups,
  showGroupHeadings = true,
}: {
  title: string;
  description: string;
  groups: readonly ToolGroup[];
  showGroupHeadings?: boolean;
}) {
  const total = groups.reduce((sum, group) => sum + group.tools.length, 0);

  return (
    <>
      <section className="bg-paper relative overflow-hidden pt-8 pb-10 sm:pt-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden [mask-image:linear-gradient(to_bottom,black_74%,transparent_99%)] lg:block"
        >
          {/* Doodles first so the character always sits in front of them. */}
          <DoodleField scale="large" region="right" />
          <Art
            src="/images/mascot-glasses.webp"
            width={470}
            height={860}
            className="absolute top-[4%] right-[-3%] h-auto w-[clamp(96px,10vw,160px)] rotate-[4deg]"
          />
        </div>

        <div className="relative mx-auto max-w-[1240px] px-4 sm:px-6">
          <h1 className="font-hand text-ink text-[clamp(2.2rem,5vw,4rem)] leading-none">{title}</h1>
          <p className="text-muted mt-4 max-w-[58ch] text-[15px] leading-relaxed sm:text-base">
            {description}
          </p>
          <p className="text-muted mt-3 font-mono text-[13px]">
            {total} {total === 1 ? 'tool' : 'tools'}
            {groups.length > 1 ? ` across ${groups.length} categories` : ''}
          </p>
        </div>
      </section>

      <div className="bg-paper relative px-4 pb-12 sm:px-6">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-12">
          {groups.map((group) => {
            const sections = groupBySection(group.category.id, group.tools);
            // Only on a single category page: on /all the tool being pointed at is already
            // on the page under its own category, so the pointer would be noise.
            const crossLinks = showGroupHeadings
              ? undefined
              : getCategoryCrossLinks(group.category.id);

            return (
              <section key={group.category.id} id={group.category.slug} className="scroll-mt-24">
                {showGroupHeadings && (
                  <SectionHeading
                    action={
                      <Link
                        href={`/${group.category.slug}`}
                        className="text-muted hover:text-foreground shrink-0 text-sm font-medium"
                      >
                        {group.tools.length} {group.tools.length === 1 ? 'tool' : 'tools'}
                      </Link>
                    }
                  >
                    {group.category.name}
                  </SectionHeading>
                )}

                {sections.length > 0 ? (
                  <div className={`flex flex-col gap-7 ${showGroupHeadings ? 'mt-6' : ''}`}>
                    {sections.map((entry) => (
                      <div
                        key={entry.section.id}
                        id={`${group.category.slug}-${entry.section.id}`}
                        className="scroll-mt-24"
                      >
                        <SubHeading
                          section={entry.section}
                          // The category header already carries the display face on /all.
                          level={showGroupHeadings ? 3 : 2}
                        />
                        <ToolGrid tools={entry.tools} className="mt-3" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <ToolGrid tools={group.tools} className={showGroupHeadings ? 'mt-5' : ''} />
                )}

                {crossLinks && <CrossLinks group={crossLinks} />}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

/**
 * Jobs that belong to this category in a visitor's head but are implemented in another one.
 * Resolved to their real registry entries and rendered as ordinary tool tiles, so they read
 * as tools rather than a separate explanatory block.
 */
function CrossLinks({ group }: { group: CategoryCrossLinkGroup }) {
  const tools = group.links
    .map((link) => getTool(link.category, link.slug))
    .filter((tool): tool is Tool => Boolean(tool));
  if (tools.length === 0) return null;

  return (
    <div className="mt-7">
      <SubHeading section={{ id: 'cross-links', name: group.name, tagline: '' }} level={2} />
      <ToolGrid tools={tools} className="mt-3" />
    </div>
  );
}

function SubHeading({ section, level }: { section: ToolSection; level: 2 | 3 }) {
  const Tag = level === 2 ? 'h2' : 'h3';
  return (
    <div className="border-border flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
      <Tag className={`font-hand text-ink ${level === 2 ? 'text-[1.7rem]' : 'text-[1.4rem]'}`}>
        {section.name}
      </Tag>
      {section.tagline && <p className="text-muted text-[13px]">{section.tagline}</p>}
    </div>
  );
}

function ToolGrid({ tools, className = '' }: { tools: readonly Tool[]; className?: string }) {
  return (
    // One column on a phone: at two, a name like "PowerPoint to PDF" no longer fits beside
    // the icon and the status chip, and the tile stops saying what the tool is.
    <ul
      className={`grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 ${className}`}
    >
      {tools.map((tool) => (
        <li key={`${tool.category}/${tool.slug}`} className="contents">
          <ToolTile tool={tool} />
        </li>
      ))}
    </ul>
  );
}
