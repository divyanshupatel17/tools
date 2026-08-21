export type WatchThemeId =
  | 'minimalism'
  | '3d'
  | 'claymorphism'
  | 'cyberpunk'
  | 'glassmorphism'
  | 'liquid-glass'
  | 'neo-brutalism'
  | 'neomorphism'
  | 'retro-y2k'
  | 'skeuomorphism'
  | 'terminal-ui';

export interface WatchThemeMeta {
  id: WatchThemeId;
  label: string;
}

/** Minimalism first: it is the default and simply follows the site's own light/dark tokens. */
export const WATCH_THEMES: readonly WatchThemeMeta[] = [
  { id: 'minimalism', label: 'Minimalism' },
  { id: '3d', label: '3D' },
  { id: 'claymorphism', label: 'Claymorphism' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'glassmorphism', label: 'Glassmorphism' },
  { id: 'liquid-glass', label: 'Liquid Glass' },
  { id: 'neo-brutalism', label: 'Neo Brutalism' },
  { id: 'neomorphism', label: 'Neomorphism' },
  { id: 'retro-y2k', label: 'Retro Y2K' },
  { id: 'skeuomorphism', label: 'Skeuomorphism' },
  { id: 'terminal-ui', label: 'Terminal UI' },
];

export const DEFAULT_WATCH_THEME: WatchThemeId = 'minimalism';

export const WATCH_ACCENT_SWATCHES: readonly string[] = [
  '#e85c9f',
  '#f5a900',
  '#eab308',
  '#3f8f4f',
  '#22c55e',
  '#0ea5e9',
  '#4386c5',
  '#7658d5',
  '#e45143',
  '#111827',
  '#64748b',
  '#f8fafc',
];

export function isWatchThemeId(value: string): value is WatchThemeId {
  return WATCH_THEMES.some((theme) => theme.id === value);
}
