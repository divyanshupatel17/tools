import Link from 'next/link';
import { MainNav } from '@/components/navigation/main_nav';
import { HeaderSearchButton } from '@/components/search/header_search_button';
import { ThemeToggle } from '@/components/theme/theme_toggle';
import { Art } from '@/components/ui/art';
import { OWNER_SITE } from '@/lib/landing/contact';

export function SiteHeader() {
  return (
    <header className="bg-paper sticky top-0 z-50">
      <div className="mx-auto flex h-[62px] w-full max-w-[1680px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Art
            src="/images/brand-logo.webp"
            width={243}
            height={176}
            className="h-9 w-auto"
            priority
          />
          <span className="hidden text-[17px] font-bold tracking-tight sm:inline">
            {OWNER_SITE}
          </span>
          <span className="bg-brand text-ink rounded-full px-2.5 py-0.5 text-[13px] font-bold">
            /tools
          </span>
        </Link>

        <MainNav className="ml-auto hidden md:block" />

        <div className="ml-auto flex shrink-0 items-center gap-0.5 md:ml-4">
          <HeaderSearchButton />
          <ThemeToggle />
        </div>
      </div>

      <MainNav className="border-border/60 border-t px-3 pb-1.5 md:hidden [&_ul]:justify-center" />
    </header>
  );
}
