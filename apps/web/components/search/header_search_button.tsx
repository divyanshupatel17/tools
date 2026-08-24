'use client';

import { Search } from 'lucide-react';
import { openSearchOverlay } from './search_overlay_store';

export function HeaderSearchButton() {
  return (
    <button
      type="button"
      aria-label="Search tools"
      onClick={openSearchOverlay}
      className="text-muted hover:bg-cream hover:text-foreground flex size-9 items-center justify-center rounded-full transition-colors"
    >
      <Search aria-hidden className="size-[19px]" />
    </button>
  );
}
