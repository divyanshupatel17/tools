'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useElapsedClock } from './use_elapsed_clock';

interface UseTimerOptions {
  /** Fires once per second while inside the final `approachWindowMs` of the countdown. */
  onApproaching?: (remainingMs: number) => void;
  /** Fires once when the countdown reaches zero. */
  onComplete?: () => void;
  approachWindowMs?: number;
}

export interface TimerControls {
  durationMs: number;
  setDuration: (ms: number) => void;
  remainingMs: number;
  running: boolean;
  progress: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
}

export function useTimer({ onApproaching, onComplete, approachWindowMs = 10_000 }: UseTimerOptions = {}): TimerControls {
  const [durationMs, setDurationMs] = useState(25 * 60 * 1000);
  const durationRef = useRef(durationMs);
  useEffect(() => {
    durationRef.current = durationMs;
  }, [durationMs]);
  const completedRef = useRef(false);
  const lastApproachSecondRef = useRef<number | null>(null);

  const clock = useElapsedClock({
    onTick: (elapsedMs) => {
      const remaining = durationRef.current - elapsedMs;
      if (remaining <= approachWindowMs && remaining > 0) {
        const remainingSecond = Math.ceil(remaining / 1000);
        if (lastApproachSecondRef.current !== remainingSecond) {
          lastApproachSecondRef.current = remainingSecond;
          onApproaching?.(remaining);
        }
      }
      if (!completedRef.current && remaining <= 0) {
        completedRef.current = true;
        onComplete?.();
      }
    },
  });

  const remainingMs = Math.max(0, durationMs - clock.elapsedMs);
  const running = clock.running && remainingMs > 0;

  useEffect(() => {
    if (clock.running && remainingMs <= 0) clock.pause();
  }, [clock, remainingMs]);

  const setDuration = useCallback(
    (ms: number) => {
      setDurationMs(Math.max(0, ms));
      completedRef.current = false;
      lastApproachSecondRef.current = null;
    },
    [],
  );

  const start = useCallback(() => {
    if (durationRef.current <= 0) return;
    completedRef.current = false;
    lastApproachSecondRef.current = null;
    clock.start();
  }, [clock]);

  const reset = useCallback(() => {
    completedRef.current = false;
    lastApproachSecondRef.current = null;
    clock.reset();
  }, [clock]);

  return {
    durationMs,
    setDuration,
    remainingMs,
    running,
    progress: durationMs > 0 ? 1 - remainingMs / durationMs : 0,
    start,
    pause: clock.pause,
    reset,
  };
}
