'use client';

import { useCallback, useRef } from 'react';

/**
 * Synthesizes short beeps with the Web Audio API instead of shipping an audio asset — this
 * repo has no asset pipeline for that and a sine-wave oscillator is a few lines either way.
 */
export function useAlertSound(enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null);

  const ensureContext = useCallback((): AudioContext | null => {
    if (!enabled || typeof window === 'undefined') return null;
    if (!contextRef.current) {
      contextRef.current = new AudioContext();
    }
    if (contextRef.current.state === 'suspended') void contextRef.current.resume();
    return contextRef.current;
  }, [enabled]);

  const playTone = useCallback(
    (frequency: number, durationMs: number, startDelayMs = 0, peakGain = 0.16) => {
      const ctx = ensureContext();
      if (!ctx) return;
      const startAt = ctx.currentTime + startDelayMs / 1000;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gainNode.gain.setValueAtTime(0, startAt);
      gainNode.gain.linearRampToValueAtTime(peakGain, startAt + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + durationMs / 1000);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + durationMs / 1000 + 0.02);
    },
    [ensureContext],
  );

  const playTick = useCallback(() => playTone(880, 90), [playTone]);
  const playChime = useCallback(() => {
    playTone(880, 220, 0);
    playTone(1320, 340, 180);
  }, [playTone]);

  return { playTick, playChime };
}
