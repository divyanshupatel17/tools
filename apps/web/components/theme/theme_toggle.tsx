'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from './theme_store';

const NEXT: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const ICON = { light: Sun, dark: Moon, system: Monitor };
const LABEL = { light: 'Light', dark: 'Dark', system: 'System' };

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const Icon = ICON[preference];

  return (
    <button
      type="button"
      onClick={() => setPreference(NEXT[preference])}
      aria-label={`Theme: ${LABEL[preference]}. Switch to ${LABEL[NEXT[preference]]}.`}
      title={`Theme: ${LABEL[preference]}`}
      className="text-muted hover:bg-surface-muted hover:text-foreground flex size-10 items-center justify-center rounded-full transition-colors"
    >
      <Icon aria-hidden className="size-[21px]" />
    </button>
  );
}
