'use client';

import { Search } from 'lucide-react';
import { openSearchOverlay } from './search_overlay_store';

// A trigger, not a live input: clicking opens the same SearchOverlay the navbar button opens, keeping one search experience site wide.
export function HeroSearchTrigger() {
  return (
    <button
      type="button"
      onClick={openSearchOverlay}
      aria-label="Search a tool"
      className="border-border bg-surface shadow-card hover:border-brand flex h-14 w-full items-center gap-3 rounded-full border pr-2 pl-5 text-left transition-colors sm:h-[60px] sm:pl-7"
    >
      <span className="text-muted min-w-0 flex-1 truncate text-[15px] sm:text-base">
        Search a tool (e.g. merge PDF, compress image, mp4 to mp3)
      </span>
      <span
        aria-hidden
        className="bg-brand text-ink flex size-10 shrink-0 items-center justify-center rounded-full sm:size-11"
      >
        <Search className="size-5" />
      </span>
    </button>
  );
}
