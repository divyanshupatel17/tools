'use client';

import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { HERO_SEARCH_ID } from './tool_search';

export function HeaderSearchButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="Search tools"
      onClick={() => {
        const input = document.getElementById(HERO_SEARCH_ID);
        if (input instanceof HTMLInputElement) {
          input.scrollIntoView({ block: 'center', behavior: 'smooth' });
          input.focus();
          return;
        }
        // Only the landing page carries the search field; send everyone else to it.
        router.push('/');
      }}
      className="text-muted hover:bg-cream hover:text-foreground flex size-9 items-center justify-center rounded-full transition-colors"
    >
      <Search aria-hidden className="size-[19px]" />
    </button>
  );
}
