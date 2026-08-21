import { describe, expect, it } from 'vitest';
import {
  formatLap,
  formatStopwatch,
  formatTimer,
  minutesSecondsToMs,
  msToMinutesSeconds,
} from '@/features/utilities/_shared/time/format_time';

describe('formatStopwatch', () => {
  it('always shows hours, minutes, seconds and centiseconds', () => {
    expect(formatStopwatch(0)).toBe('00:00:00.00');
    expect(formatStopwatch(1_234)).toBe('00:00:01.23');
    expect(formatStopwatch(61_500)).toBe('00:01:01.50');
    expect(formatStopwatch(3_661_040)).toBe('01:01:01.04');
  });
});

describe('formatLap', () => {
  it('formats minutes, seconds and centiseconds without hours', () => {
    expect(formatLap(170_300)).toBe('02:50.30');
    expect(formatLap(0)).toBe('00:00.00');
  });
});

describe('formatTimer', () => {
  it('formats under an hour as MM:SS', () => {
    expect(formatTimer(0)).toBe('00:00');
    expect(formatTimer(1_500 * 1000)).toBe('25:00');
  });

  it('adds hours once the remaining time crosses one', () => {
    expect(formatTimer(3_661_000)).toBe('1:01:01');
  });
});

describe('minutesSecondsToMs / msToMinutesSeconds', () => {
  it('round trips a duration', () => {
    expect(minutesSecondsToMs(25, 0)).toBe(1_500_000);
    expect(msToMinutesSeconds(1_500_000)).toEqual({ minutes: 25, seconds: 0 });
  });

  it('clamps negative input to zero', () => {
    expect(minutesSecondsToMs(-5, -5)).toBe(0);
  });
});
