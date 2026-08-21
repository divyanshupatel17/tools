'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { WATCH_ACCENT_SWATCHES, WATCH_THEMES } from '../themes/watch_themes';
import { useWatchPrefs, type WatchMode } from '../state/use_watch_prefs';

const FACE_STYLES = ['digital', 'analog'] as const;

/**
 * Panel content only — no trigger button, no popover positioning of its own. `ActionBar` owns
 * the single shared popover shell so it always anchors above the whole bar, not one icon.
 * Each theme tile is itself a `.watch-widget[data-watch-theme=…]`, so it previews that theme's
 * real page and face colours rather than sitting inside the currently active theme's button
 * chrome — the point of a theme picker is to tell the options apart.
 */
export function ThemePickerPanel({ mode }: { mode: WatchMode }) {
  const prefs = useWatchPrefs();

  return (
    <div>
      <p className="mb-3 text-xs font-semibold tracking-[0.15em] text-[var(--w-muted)] uppercase">Theme</p>
      <div className="grid grid-cols-3 gap-3">
        {WATCH_THEMES.map((theme) => {
          const selected = prefs.theme === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => prefs.set({ theme: theme.id })}
              aria-pressed={selected}
              data-watch-theme={theme.id}
              data-watch-mode={mode}
              style={{ borderColor: selected ? 'var(--w-accent)' : 'transparent' }}
              className="watch-widget flex flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center transition-transform hover:scale-[1.02]"
            >
              <span className="watch-face flex size-12 shrink-0 items-center justify-center rounded-full">
                {selected && <Check aria-hidden className="size-4" style={{ color: 'var(--w-accent)' }} />}
              </span>
              <span className="text-xs leading-tight font-medium" style={{ color: 'var(--w-text)' }}>
                {theme.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-6 mb-3 text-xs font-semibold tracking-[0.15em] text-[var(--w-muted)] uppercase">Face</p>
      <div className="flex gap-3">
        {FACE_STYLES.map((face) => (
          <button
            key={face}
            type="button"
            onClick={() => prefs.set({ face })}
            aria-pressed={prefs.face === face}
            className={cn(
              'watch-button flex-1 rounded-full px-4 py-3 text-sm font-medium capitalize',
              prefs.face === face && 'watch-button-primary',
            )}
          >
            {face}
          </button>
        ))}
      </div>

      <p className="mt-6 mb-3 text-xs font-semibold tracking-[0.15em] text-[var(--w-muted)] uppercase">
        Accent colour
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {WATCH_ACCENT_SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => prefs.set({ accent: color })}
            aria-label={`Use accent ${color}`}
            aria-pressed={prefs.accent === color}
            style={{ background: color }}
            className={cn(
              'size-8 rounded-full border-2 transition-transform',
              prefs.accent === color ? 'scale-110 border-[var(--w-text)]' : 'border-transparent hover:scale-105',
            )}
          />
        ))}
        <input
          type="color"
          value={prefs.accent ?? '#e85c9f'}
          onChange={(event) => prefs.set({ accent: event.target.value })}
          aria-label="Custom accent colour"
          className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0"
        />
        {prefs.accent && (
          <button
            type="button"
            onClick={() => prefs.set({ accent: null })}
            className="text-xs text-[var(--w-muted)] underline"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
