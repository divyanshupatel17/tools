'use client';

import { useEffect } from 'react';

interface WatchHotkeys {
  onToggle: () => void;
  onLap?: () => void;
  onReset?: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** Space toggles start/pause, L laps, R resets — ignored while a text field has focus. */
export function useWatchHotkeys({ onToggle, onLap, onReset }: WatchHotkeys) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        onToggle();
      } else if (onLap && (event.key === 'l' || event.key === 'L')) {
        event.preventDefault();
        onLap();
      } else if (onReset && (event.key === 'r' || event.key === 'R')) {
        event.preventDefault();
        onReset();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onToggle, onLap, onReset]);
}
