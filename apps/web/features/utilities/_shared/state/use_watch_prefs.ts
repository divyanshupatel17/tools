'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_WATCH_THEME, isWatchThemeId, type WatchThemeId } from '../themes/watch_themes';
import { TIME_FORMAT_OPTIONS, type TimeFormatPreset } from '../time/format_time';

export type WatchMode = 'light' | 'dark';
export type WatchFaceStyle = 'digital' | 'analog';

export interface WatchPrefs {
  theme: WatchThemeId;
  mode: WatchMode;
  face: WatchFaceStyle;
  accent: string | null;
  soundOn: boolean;
  timeFormat: TimeFormatPreset;
}

const STORAGE_KEY = 'tools:watch-prefs';

const DEFAULT_PREFS: WatchPrefs = {
  theme: DEFAULT_WATCH_THEME,
  mode: 'light',
  face: 'digital',
  accent: null,
  soundOn: true,
  timeFormat: 'auto',
};

function isTimeFormatPreset(value: unknown): value is TimeFormatPreset {
  return typeof value === 'string' && TIME_FORMAT_OPTIONS.some((option) => option.value === value);
}

const listeners = new Set<() => void>();
let state: WatchPrefs | null = null;

function siteMode(): WatchMode {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function read(): WatchPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WatchPrefs>;
      return {
        theme: parsed.theme && isWatchThemeId(parsed.theme) ? parsed.theme : DEFAULT_WATCH_THEME,
        mode: parsed.mode === 'dark' || parsed.mode === 'light' ? parsed.mode : siteMode(),
        face: parsed.face === 'analog' ? 'analog' : 'digital',
        accent: typeof parsed.accent === 'string' ? parsed.accent : null,
        soundOn: parsed.soundOn !== false,
        timeFormat: isTimeFormatPreset(parsed.timeFormat) ? parsed.timeFormat : 'auto',
      };
    }
  } catch {
    // Private browsing can reject reads; fall through to defaults.
  }
  return { ...DEFAULT_PREFS, mode: siteMode() };
}

function persist(next: WatchPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing can reject writes; the preference still applies for this session.
  }
}

function emit(next: WatchPrefs) {
  state = next;
  persist(next);
  for (const listener of listeners) listener();
}

export function setWatchPrefs(patch: Partial<WatchPrefs>): void {
  emit({ ...(state ?? read()), ...patch });
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): WatchPrefs {
  state ??= read();
  return state;
}

const SERVER_SNAPSHOT: WatchPrefs = DEFAULT_PREFS;

export function useWatchPrefs(): WatchPrefs & { set: (patch: Partial<WatchPrefs>) => void } {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  return { ...current, set: setWatchPrefs };
}
