'use client';

import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from 'react';

function subscribeNever(): () => void {
  return () => {};
}

function getFullscreenSupport(): boolean {
  return Boolean(document.documentElement.requestFullscreen);
}

function getServerFullscreenSupport(): boolean {
  return false;
}

export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Matches false on the server and the first client render, then a subsequent client-only
  // read flips it — the sanctioned way to read a browser-only API without a hydration mismatch.
  const supported = useSyncExternalStore(subscribeNever, getFullscreenSupport, getServerFullscreenSupport);

  useEffect(() => {
    function onChange() {
      setIsFullscreen(document.fullscreenElement === ref.current);
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [ref]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void ref.current?.requestFullscreen?.();
    }
  }, [ref]);

  return { isFullscreen, toggle, supported };
}
