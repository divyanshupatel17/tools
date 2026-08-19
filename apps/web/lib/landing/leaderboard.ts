export interface LeaderboardRow {
  name: string;
  score: number;
}

/**
 * The runner keeps a personal best in localStorage. There is no backend, so the
 * weekly board and the all-time figure are a static sample until one exists —
 * swap this module for a fetch when scores are actually recorded somewhere.
 */
export const WEEKLY_TOP_5: readonly LeaderboardRow[] = [
  { name: 'CodeWithHarry', score: 45876 },
  { name: 'devSam', score: 41234 },
  { name: 'ToolMaster', score: 38901 },
  { name: 'WebWizard', score: 34567 },
  { name: 'PixelDev', score: 29876 },
];

export const ALL_TIME_HIGH_SCORE = 45876;

/** Personal best lives in the visitor's own browser and never leaves it. */
export const BEST_SCORE_KEY = 'tools.runner.best';
