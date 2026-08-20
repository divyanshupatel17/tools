'use client';

import { useCallback, useState } from 'react';
import { useElapsedClock } from './use_elapsed_clock';

export interface Lap {
  id: number;
  /** Time since the previous lap. */
  lapMs: number;
  /** Time since the run started. */
  totalMs: number;
}

export interface StopwatchControls {
  elapsedMs: number;
  running: boolean;
  laps: readonly Lap[];
  start: () => void;
  pause: () => void;
  reset: () => void;
  lap: () => void;
}

export function useStopwatch(): StopwatchControls {
  const clock = useElapsedClock();
  const [laps, setLaps] = useState<Lap[]>([]);

  const lap = useCallback(() => {
    setLaps((previous) => {
      const previousTotal = previous[0]?.totalMs ?? 0;
      const totalMs = clock.elapsedMs;
      const entry: Lap = { id: previous.length + 1, totalMs, lapMs: totalMs - previousTotal };
      return [entry, ...previous];
    });
  }, [clock.elapsedMs]);

  const reset = useCallback(() => {
    clock.reset();
    setLaps([]);
  }, [clock]);

  return { elapsedMs: clock.elapsedMs, running: clock.running, laps, start: clock.start, pause: clock.pause, reset, lap };
}
