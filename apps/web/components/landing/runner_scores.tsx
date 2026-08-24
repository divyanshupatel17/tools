'use client';

import { useRunnerScores } from '@/lib/landing/runner_store';

const pad = (value: number) => String(value).padStart(5, '0');

/** Lives in the footer's project column; the canvas feeds it through the store. */
export function RunnerScores() {
  const { score, best } = useRunnerScores();

  return (
    <dl className="text-ink/75 mt-3 space-y-0.5 font-mono text-[13px]">
      <div className="flex items-baseline gap-2">
        <dt>My High Score:</dt>
        <dd className="text-ink font-bold tabular-nums">{pad(best)}</dd>
      </div>
      <div className="flex items-baseline gap-2">
        <dt>Score:</dt>
        <dd className="tabular-nums">{pad(score)}</dd>
      </div>
    </dl>
  );
}
