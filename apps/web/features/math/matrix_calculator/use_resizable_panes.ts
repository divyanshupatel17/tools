'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const KEYBOARD_STEP = 3;

function clampPair(
  percents: number[],
  handleIndex: number,
  deltaPercent: number,
  minPercent: number,
): number[] {
  const next = [...percents];
  const left = handleIndex;
  const right = handleIndex + 1;
  let newLeft = percents[left]! + deltaPercent;
  let newRight = percents[right]! - deltaPercent;
  if (newLeft < minPercent) {
    newRight -= minPercent - newLeft;
    newLeft = minPercent;
  }
  if (newRight < minPercent) {
    newLeft -= minPercent - newRight;
    newRight = minPercent;
  }
  next[left] = Math.max(minPercent, newLeft);
  next[right] = Math.max(minPercent, newRight);
  return next;
}

/**
 * Drag-to-resize widths (or heights) for N panes in a row (N-1 handles), as percentages of
 * the container's own size so the split stays proportional across window resizes.
 */
export function useResizablePanes(
  initial: number[],
  minPercent = 14,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [percents, setPercents] = useState<number[]>(initial);
  const dragState = useRef<{ handleIndex: number; startPos: number; startPercents: number[] } | null>(null);
  // minPercent only ever comes from a hook argument that doesn't change across a component's
  // lifetime in practice, but a ref (updated post render, in the effect below) keeps the
  // handlers correct even if it did.
  const minPercentRef = useRef(minPercent);
  const orientationRef = useRef(orientation);

  // Built once via useState's lazy initializer so addEventListener/removeEventListener always
  // agree on the same function identity; recreating them on every render would go stale
  // mid-drag across the re-renders that setPercents itself triggers, leaking the listener.
  const [handlers] = useState(() => {
    const self: { move: (event: PointerEvent) => void; up: () => void } = {
      move: (event) => {
        const drag = dragState.current;
        const container = containerRef.current;
        if (!drag || !container) return;
        const pos = orientationRef.current === 'horizontal' ? event.clientX : event.clientY;
        const size = orientationRef.current === 'horizontal' ? container.offsetWidth : container.offsetHeight;
        const deltaPercent = ((pos - drag.startPos) / size) * 100;
        setPercents(clampPair(drag.startPercents, drag.handleIndex, deltaPercent, minPercentRef.current));
      },
      up: () => {
        dragState.current = null;
        window.removeEventListener('pointermove', self.move);
        window.removeEventListener('pointerup', self.up);
      },
    };
    return self;
  });

  useEffect(() => {
    minPercentRef.current = minPercent;
    orientationRef.current = orientation;
  }, [minPercent, orientation]);

  const startDrag = useCallback(
    (handleIndex: number) => (event: { clientX: number; clientY: number }) => {
      const startPos = orientationRef.current === 'horizontal' ? event.clientX : event.clientY;
      dragState.current = { handleIndex, startPos, startPercents: percents };
      window.addEventListener('pointermove', handlers.move);
      window.addEventListener('pointerup', handlers.up);
    },
    [percents, handlers],
  );

  const nudge = useCallback(
    (handleIndex: number, direction: -1 | 1) => {
      setPercents((prev) => clampPair(prev, handleIndex, direction * KEYBOARD_STEP, minPercentRef.current));
    },
    [],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlers.move);
      window.removeEventListener('pointerup', handlers.up);
    };
  }, [handlers]);

  return { containerRef, percents, startDrag, nudge };
}

/** Tracks whether an element has been squeezed below a width threshold, for compact rendering. */
export function useCompact(threshold = 190): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setCompact(width < threshold);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, compact];
}
