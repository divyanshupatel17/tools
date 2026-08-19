'use client';

import { useSyncExternalStore } from 'react';

export interface RunnerScores {
  score: number;
  best: number;
}

const INITIAL: RunnerScores = { score: 0, best: 0 };

let state: RunnerScores = INITIAL;
const listeners = new Set<() => void>();

/**
 * The runner canvas and the footer leaderboard are separate subtrees, so the two
 * live scores travel through this tiny store instead of a context provider.
 */
export function publishRunnerScores(next: RunnerScores): void {
  if (next.score === state.score && next.best === state.best) return;
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function useRunnerScores(): RunnerScores {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
}
