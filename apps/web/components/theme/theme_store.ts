'use client';

import { useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY } from './theme_script';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface ThemeState {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
}

const SERVER_STATE: ThemeState = { preference: 'system', resolved: 'light' };

const listeners = new Set<() => void>();
let state: ThemeState | null = null;

function read(): ThemeState {
  const root = document.documentElement;
  return {
    preference: (root.dataset.themePreference as ThemePreference | undefined) ?? 'system',
    resolved: root.dataset.theme === 'dark' ? 'dark' : 'light',
  };
}

function write(preference: ThemePreference): ThemeState {
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.themePreference = preference;
  return { preference, resolved: dark ? 'dark' : 'light' };
}

function emit(next: ThemeState) {
  state = next;
  for (const listener of listeners) listener();
}

export function setThemePreference(preference: ThemePreference): void {
  emit(write(preference));
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private browsing can reject writes; the theme still applies for this session.
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => {
    if ((state ?? read()).preference === 'system') emit(write('system'));
  };
  media.addEventListener('change', onSystemChange);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener('change', onSystemChange);
  };
}

function getSnapshot(): ThemeState {
  state ??= read();
  return state;
}

export function useTheme(): ThemeState & { setPreference: (next: ThemePreference) => void } {
  const current = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
  return { ...current, setPreference: setThemePreference };
}
