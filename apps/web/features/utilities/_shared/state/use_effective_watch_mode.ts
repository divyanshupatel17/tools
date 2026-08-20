'use client';

import { useTheme } from '@/components/theme/theme_store';
import { useWatchPrefs, type WatchMode } from './use_watch_prefs';

/**
 * Outside fullscreen the watch just mirrors the site's own light/dark toggle — the dedicated
 * appearance toggle in the action bar only takes over once the tool is fullscreen, where it's
 * its own dedicated screen.
 */
export function useEffectiveWatchMode(isFullscreen: boolean): WatchMode {
  const prefs = useWatchPrefs();
  const site = useTheme();
  return isFullscreen ? prefs.mode : site.resolved;
}
