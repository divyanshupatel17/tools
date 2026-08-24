export interface LeaderboardRow {
  name: string;
  score: number;
}

/** No backend yet: weekly board and all-time figure are a static sample until scores are
 * actually recorded somewhere and this becomes a fetch. */
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
