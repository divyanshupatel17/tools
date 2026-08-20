const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

function pad(value: number, length = 2): string {
  return String(Math.max(0, Math.trunc(value))).padStart(length, '0');
}

/** "HH:MM:SS.cc" — a stopwatch always shows hours, since a run can cross one. */
export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / HOUR_MS);
  const minutes = Math.floor((total % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((total % MINUTE_MS) / SECOND_MS);
  const centis = Math.floor((total % SECOND_MS) / 10);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

/** "MM:SS.cc" — a lap split, relative to the run so far, minutes only (not hours). */
export function formatLap(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / MINUTE_MS);
  const seconds = Math.floor((total % MINUTE_MS) / SECOND_MS);
  const centis = Math.floor((total % SECOND_MS) / 10);
  return `${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

/** "MM:SS", or "H:MM:SS" once the remaining time crosses an hour. */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / HOUR_MS);
  const minutes = Math.floor((total % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((total % MINUTE_MS) / SECOND_MS);
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function minutesSecondsToMs(minutes: number, seconds: number): number {
  return Math.max(0, Math.round(minutes) * MINUTE_MS + Math.round(seconds) * SECOND_MS);
}

export function msToMinutesSeconds(ms: number): { minutes: number; seconds: number } {
  const total = Math.max(0, Math.round(ms));
  return { minutes: Math.floor(total / MINUTE_MS), seconds: Math.floor((total % MINUTE_MS) / SECOND_MS) };
}

export type TimeFormatPreset = 'auto' | 'hh:mm:ss' | 'hh:mm' | 'mm:ss' | 'hh:mm:ss.ms';

export const TIME_FORMAT_OPTIONS: readonly { value: TimeFormatPreset; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'hh:mm:ss', label: 'HH:MM:SS' },
  { value: 'hh:mm', label: 'HH:MM' },
  { value: 'mm:ss', label: 'MM:SS' },
  { value: 'hh:mm:ss.ms', label: 'HH:MM:SS.MS' },
];

/**
 * Overrides a tool's own smart default (`formatStopwatch`/`formatTimer`) with an explicit unit
 * layout the user picked from the action bar's format picker. `'auto'` defers to `autoFormat`.
 */
export function formatWithPreset(ms: number, preset: TimeFormatPreset, autoFormat: (ms: number) => string): string {
  if (preset === 'auto') return autoFormat(ms);
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / HOUR_MS);
  const minutes = Math.floor((total % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((total % MINUTE_MS) / SECOND_MS);
  const centis = Math.floor((total % SECOND_MS) / 10);
  switch (preset) {
    case 'hh:mm:ss':
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    case 'hh:mm':
      return `${pad(hours)}:${pad(minutes)}`;
    case 'mm:ss': {
      // Uncapped total minutes rather than minutes-within-the-hour, so a run past an hour
      // still reads correctly instead of silently losing the elapsed hours.
      const totalMinutes = Math.floor(total / MINUTE_MS);
      return `${pad(totalMinutes)}:${pad(seconds)}`;
    }
    case 'hh:mm:ss.ms':
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
  }
}

export function hoursMinutesSecondsToMs(hours: number, minutes: number, seconds: number): number {
  return Math.max(
    0,
    Math.round(hours) * HOUR_MS + Math.round(minutes) * MINUTE_MS + Math.round(seconds) * SECOND_MS,
  );
}

export function msToHoursMinutesSeconds(ms: number): { hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.round(ms));
  return {
    hours: Math.floor(total / HOUR_MS),
    minutes: Math.floor((total % HOUR_MS) / MINUTE_MS),
    seconds: Math.floor((total % MINUTE_MS) / SECOND_MS),
  };
}
