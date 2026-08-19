import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { SectionHeading } from './section_heading';
import { Doodle } from '@/components/ui/doodle';
import { ToolIcon } from '@/components/ui/tool_icon';
import { accentStyle } from '@/lib/tools/accents';
import { TOOL_CATEGORIES } from '@/lib/tools/categories';
import { getToolsByCategory } from '@/lib/tools/registry';

export function CategoriesSection() {
  return (
    <section className="bg-paper relative px-4 pb-10 sm:px-6">
      <div className="relative mx-auto max-w-[1240px]">
        <Doodle
          name="swirl"
          className="absolute top-[-4px] left-[42%] hidden h-auto w-14 lg:block"
        />
        <Doodle
          name="paper-plane"
          className="absolute top-[-14px] right-[16%] hidden h-auto w-14 lg:block"
        />
        <Doodle name="sun" className="absolute top-[-2px] right-[4%] hidden h-auto w-6 lg:block" />
        <Doodle
          name="sprig"
          className="absolute right-[-10px] bottom-6 hidden h-auto w-8 xl:block"
        />

        <SectionHeading
          id="categories"
          icon={<LayoutGrid aria-hidden className="text-ink size-6" />}
        >
          Categories
        </SectionHeading>

        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TOOL_CATEGORIES.map((category) => {
            const count = getToolsByCategory(category.id).length;

            return (
              <li key={category.id} className="contents">
                <Link
                  href={`/${category.slug}`}
                  className="border-border bg-surface hover:border-brand hover:shadow-card flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition-colors"
                >
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                    style={accentStyle(category.id)}
                  >
                    <ToolIcon name={category.icon} className="size-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold">{category.name}</span>
                    <span className="text-muted block text-[13px]">
                      {count} {count === 1 ? 'Tool' : 'Tools'}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
