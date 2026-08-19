import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SectionHeading } from './section_heading';
import { Doodle } from '@/components/ui/doodle';
import { ToolIcon } from '@/components/ui/tool_icon';
import { accentStyle, toolAccent } from '@/lib/tools/accents';
import { getPopularTools, toolPath } from '@/lib/tools/registry';

export function PopularTools() {
  const tools = getPopularTools(6);

  return (
    <section className="bg-paper relative px-4 pb-10 sm:px-6">
      <div className="relative mx-auto max-w-[1240px]">
        <Doodle
          name="arrow-flick"
          className="absolute top-[-6px] left-[9.5rem] hidden h-auto w-8 sm:block"
        />

        <SectionHeading
          id="popular"
          action={
            <Link
              href="/all"
              className="text-muted hover:text-foreground flex shrink-0 items-center gap-1.5 text-sm font-medium"
            >
              View all tools
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          }
        >
          Popular Tools
        </SectionHeading>

        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {tools.map((tool) => (
            <li key={`${tool.category}/${tool.slug}`} className="contents">
              <Link
                href={toolPath(tool)}
                className="border-border bg-surface hover:border-brand hover:shadow-card flex flex-col items-center gap-2.5 rounded-2xl border px-3 py-5 text-center transition-colors"
              >
                <span
                  className="flex size-14 items-center justify-center rounded-2xl"
                  style={accentStyle(toolAccent(tool))}
                >
                  <ToolIcon name={tool.icon} className="size-7" />
                </span>
                <span className="text-[15px] font-bold">{tool.name}</span>
                <span className="text-muted line-clamp-2 text-[12.5px] leading-snug">
                  {tool.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
