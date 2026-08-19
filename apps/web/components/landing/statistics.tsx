import { SectionHeading } from './section_heading';
import { Art } from '@/components/ui/art';
import { Doodle } from '@/components/ui/doodle';
import { ToolIcon } from '@/components/ui/tool_icon';
import { accentStyle } from '@/lib/tools/accents';
import { SITE_STATS } from '@/lib/landing/site_stats';

export function Statistics() {
  return (
    <section className="bg-paper relative px-4 pt-4 pb-10 sm:px-6">
      <div className="relative mx-auto max-w-[1240px]">
        <SectionHeading>Statistics</SectionHeading>

        <div className="mt-2 flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
          <div className="relative shrink-0">
            <Doodle name="sprig" className="absolute bottom-0 -left-6 hidden h-auto w-8 md:block" />
            <Art
              src="/images/stats-mascots.webp"
              width={720}
              height={651}
              className="h-auto w-[clamp(150px,20vw,250px)]"
            />
          </div>

          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
            {SITE_STATS.map((stat) => (
              <div key={stat.label}>
                <dt className="text-muted flex items-center gap-2 text-[13.5px] font-medium">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                    style={accentStyle(stat.accent)}
                  >
                    <ToolIcon name={stat.icon} className="size-[18px]" />
                  </span>
                  {stat.label}
                </dt>
                <dd className="mt-1.5 pl-10 text-[clamp(1.1rem,2vw,1.5rem)] font-bold tracking-tight">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>

          <Doodle name="sprig" className="hidden h-auto w-12 self-end lg:block" />
        </div>
      </div>
    </section>
  );
}
