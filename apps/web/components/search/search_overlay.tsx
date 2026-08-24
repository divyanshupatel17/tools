'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { ToolSearch } from './tool_search';
import {
  closeSearchOverlay,
  getSearchOverlayOpen,
  getSearchOverlaySnapshot,
  subscribeSearchOverlay,
} from './search_overlay_store';

// The one search surface for the whole site; header_search_button.tsx and hero_search_trigger.tsx just call openSearchOverlay() to open it.
export function SearchOverlay() {
  const open = useSyncExternalStore(
    subscribeSearchOverlay,
    getSearchOverlayOpen,
    getSearchOverlaySnapshot,
  );
  const pathname = usePathname();

  // <Link> navigation changes the path without unmounting this portal — close explicitly.
  useEffect(() => {
    closeSearchOverlay();
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeSearchOverlay();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search tools"
      className="animate-search-scrim fixed inset-0 z-[60] flex justify-center bg-black/45 px-4 pt-[12vh] backdrop-blur-sm sm:pt-[16vh]"
      onClick={() => closeSearchOverlay()}
    >
      <div
        className="animate-search-lift w-full max-w-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => closeSearchOverlay()}
            aria-label="Close search"
            className="text-ink bg-brand flex size-9 items-center justify-center rounded-full shadow-lg"
          >
            <X aria-hidden className="size-[18px]" />
          </button>
        </div>
        <ToolSearch autoFocus onNavigate={() => closeSearchOverlay()} />
      </div>
    </div>,
    document.body,
  );
}
