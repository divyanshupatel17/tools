'use client';

import { useEffect, type RefObject } from 'react';

const STORAGE_KEY = 'tools:watch-reenter-fullscreen';

/** Call before navigating away while fullscreen, so the destination tool can resume it. */
export function markReenterFullscreen(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Private browsing can reject writes; the switch just lands outside fullscreen.
  }
}

/**
 * Best effort re-entry into fullscreen right after a same-tab navigation (e.g. the quick
 * switch link between Stopwatch and Timer). Browsers only grant `requestFullscreen()` on
 * "sticky" user activation, which a same-document client-side navigation typically still
 * carries for a short window — but it's not guaranteed, so failures are swallowed silently
 * rather than surfaced as an error the user never asked to see.
 */
export function useResumeFullscreen(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    let shouldResume = false;
    try {
      shouldResume = sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // Ignore.
    }
    if (!shouldResume) return;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore.
    }
    ref.current?.requestFullscreen?.().catch(() => {});
  }, [ref]);
}
