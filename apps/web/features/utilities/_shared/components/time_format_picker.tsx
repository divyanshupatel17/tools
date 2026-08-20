'use client';

import { cn } from '@/lib/utils/cn';
import { TIME_FORMAT_OPTIONS } from '../time/format_time';
import { useWatchPrefs } from '../state/use_watch_prefs';

/**
 * Panel content only — no trigger button, no popover positioning of its own. `ActionBar` owns
 * the single shared popover shell so it always anchors above the whole bar, not one icon.
 */
export function TimeFormatPanel() {
  const prefs = useWatchPrefs();

  return (
    <div>
      <p className="mb-3 text-xs font-semibold tracking-[0.15em] text-[var(--w-muted)] uppercase">Time format</p>
      <div className="flex flex-col gap-2">
        {TIME_FORMAT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => prefs.set({ timeFormat: option.value })}
            aria-pressed={prefs.timeFormat === option.value}
            className={cn(
              'watch-button block w-full rounded-full px-4 py-3 text-left text-sm font-medium',
              prefs.timeFormat === option.value && 'watch-button-primary',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
