import Link from 'next/link';
import { MainNav } from '@/components/navigation/main_nav';
import { HeaderSearchButton } from '@/components/search/header_search_button';
import { SearchOverlay } from '@/components/search/search_overlay';
import { ThemeToggle } from '@/components/theme/theme_toggle';
import { Art } from '@/components/ui/art';
import { SOCIAL_ICONS } from '@/components/ui/social_icons';
import { REPO_URL } from '@/lib/landing/contact';

const GitHubIcon = SOCIAL_ICONS.GitHub!;

export function SiteHeader() {
  return (
    <header className="bg-paper sticky top-0 z-50">
      <div className="mx-auto flex h-[62px] w-full max-w-[1680px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="ToolHub home">
          <Art src="/images/brand-icon.webp" width={479} height={400} className="h-9 w-auto" priority />
          <Art
            src="/images/brand-wordmark.webp"
            width={647}
            height={200}
            className="hidden h-[22px] w-auto sm:block"
            priority
          />
        </Link>

        <MainNav className="ml-auto hidden lg:block" />

        <div className="ml-auto flex shrink-0 items-center gap-0.5 lg:ml-4">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Star ToolHub on GitHub"
            title="Star, fork, or contribute on GitHub"
            className="text-muted hover:bg-surface-muted hover:text-foreground flex size-10 items-center justify-center rounded-full transition-colors"
          >
            <GitHubIcon className="size-[18px]" />
          </a>
          <HeaderSearchButton />
          <ThemeToggle />
        </div>
      </div>

      <MainNav className="border-border/60 border-t px-3 pb-1.5 lg:hidden [&_ul]:justify-center" />

      <SearchOverlay />
    </header>
  );
}
