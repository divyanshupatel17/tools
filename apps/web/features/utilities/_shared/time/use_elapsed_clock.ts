'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ElapsedClockControls {
  elapsedMs: number;
  running: boolean;
  start: () => void;
  pause: () => void;
  /** Stops and zeroes the clock; pass `resume: true` to zero it but keep it running. */
  reset: (options?: { resume?: boolean }) => void;
}

interface UseElapsedClockOptions {
  tickMs?: number;
  onTick?: (elapsedMs: number) => void;
}

/**
 * Anchors elapsed time to `performance.now()` timestamps rather than counting ticks, so a
 * throttled or suspended background tab never drifts: whenever the interval next fires it
 * recomputes the real delta instead of having under-counted ticks while hidden.
 */
export function useElapsedClock({ tickMs = 100, onTick }: UseElapsedClockOptions = {}): ElapsedClockControls {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const accumulatedRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  const computeElapsed = useCallback(() => {
    if (startedAtRef.current === null) return accumulatedRef.current;
    return accumulatedRef.current + (performance.now() - startedAtRef.current);
  }, []);

  const tick = useCallback(() => {
    const value = computeElapsed();
    setElapsedMs(value);
    onTickRef.current?.(value);
  }, [computeElapsed]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(tick, tickMs);
    return () => clearInterval(id);
  }, [running, tick, tickMs]);

  useEffect(() => {
    function onVisibilityChange() {
      if (running) tick();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [running, tick]);

  const start = useCallback(() => {
    if (startedAtRef.current !== null) return;
    startedAtRef.current = performance.now();
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    if (startedAtRef.current === null) return;
    accumulatedRef.current = computeElapsed();
    startedAtRef.current = null;
    setRunning(false);
    setElapsedMs(accumulatedRef.current);
  }, [computeElapsed]);

  const reset = useCallback((options?: { resume?: boolean }) => {
    accumulatedRef.current = 0;
    startedAtRef.current = options?.resume ? performance.now() : null;
    setRunning(Boolean(options?.resume));
    setElapsedMs(0);
  }, []);

  return { elapsedMs, running, start, pause, reset };
}
