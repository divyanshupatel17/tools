'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { RowState, SliderRange } from '../shared/expression_types';
import { buildGraphModel, colorForIndex, defaultSliderRange, type RowResult } from './model';
import { clampScale, DEFAULT_VIEWPORT, screenToWorld, type Viewport } from './viewport';

export type { RowState, SliderRange };

let rowIdCounter = 0;
function nextRowId(): string {
  rowIdCounter += 1;
  return `expr${rowIdCounter}`;
}

const INITIAL_ROWS: RowState[] = [
  { id: nextRowId(), raw: 'y=a*sin(x)', color: colorForIndex(0), hidden: false },
  { id: nextRowId(), raw: 'a=1', color: colorForIndex(1), hidden: false },
];

/**
 * One animated flower centered on the origin, plus a handful of cheap (non-implicit) curves
 * touching the other function categories. Only the flower itself costs a marching-squares
 * pass each frame — everything else is a plain, fast y = f(x) sample — so this stays light
 * even while the flower's scale slider is playing.
 *
 * The flower is a 5-petal polar rose r = cos(5*theta), written without trigonometry via
 * r^(k+1) = Re[(x+iy)^k] for k = 5: (x^2+y^2)^3 = x^5 - 10*x^3*y^2 + 5*x*y^4, substituting
 * x/a and y/a to resize the whole curve as the slider `a` animates.
 */
const EXAMPLE_EXPRESSIONS = [
  'a=1.5',
  '((x/a)^2+(y/a)^2)^3=(x/a)^5-10*(x/a)^3*(y/a)^2+5*(x/a)*(y/a)^4',
  'y=sin(x)',
  'y=tanh(x)*2',
  'y=ln(x+11)-3',
  'y=sqrt(x+10)-5',
  'y=mod(x,4)-2',
  'y=max(x/3,-3)',
] as const;
const EXAMPLE_SLIDER_COUNT = 1;
const EXAMPLE_SLIDER_RANGE: SliderRange = { min: 0.4, max: 4, step: 0.02 };

export function useGraphingCalculator() {
  const [rows, setRows] = useState<RowState[]>(INITIAL_ROWS);
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});
  const [sliderRanges, setSliderRanges] = useState<Record<string, SliderRange>>({});
  const [playing, setPlaying] = useState<Record<string, boolean>>({});
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);

  const model: RowResult[] = useMemo(() => buildGraphModel(rows, sliderValues), [rows, sliderValues]);

  const rangeFor = useCallback(
    (id: string, declaredValue: number): SliderRange => sliderRanges[id] ?? defaultSliderRange(declaredValue),
    [sliderRanges],
  );

  const loadExamples = useCallback(() => {
    const entries = EXAMPLE_EXPRESSIONS.map((raw, index) => ({ id: nextRowId(), raw, color: colorForIndex(index), hidden: false }));
    setRows(entries);
    setSliderValues({});
    const sliderIds = entries.slice(0, EXAMPLE_SLIDER_COUNT).map((entry) => entry.id);
    setSliderRanges(Object.fromEntries(sliderIds.map((id) => [id, EXAMPLE_SLIDER_RANGE])));
    setPlaying(Object.fromEntries(sliderIds.map((id) => [id, true])));
  }, []);

  const clearAll = useCallback(() => {
    setRows([{ id: nextRowId(), raw: '', color: colorForIndex(0), hidden: false }]);
    setSliderValues({});
    setSliderRanges({});
    setPlaying({});
  }, []);

  const addRow = useCallback((afterId?: string) => {
    const id = nextRowId();
    setRows((current) => {
      const usedColors = current.length;
      const entry: RowState = { id, raw: '', color: colorForIndex(usedColors), hidden: false };
      if (!afterId) return [...current, entry];
      const index = current.findIndex((row) => row.id === afterId);
      if (index === -1) return [...current, entry];
      return [...current.slice(0, index + 1), entry, ...current.slice(index + 1)];
    });
    return id;
  }, []);

  const updateRowText = useCallback((id: string, raw: string) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, raw } : row)));
    setSliderValues((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((current) => (current.length <= 1 ? current : current.filter((row) => row.id !== id)));
    setSliderValues((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setPlaying((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const toggleHidden = useCallback((id: string) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, hidden: !row.hidden } : row)));
  }, []);

  const setColor = useCallback((id: string, color: string) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, color } : row)));
  }, []);

  /** Moves `activeId` to sit at `overId`'s current position, shifting everything between. */
  const reorderRow = useCallback((activeId: string, overId: string) => {
    setRows((current) => {
      const fromIndex = current.findIndex((row) => row.id === activeId);
      const toIndex = current.findIndex((row) => row.id === overId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return current;
      return arrayMove(current, fromIndex, toIndex);
    });
  }, []);

  const setSliderValue = useCallback((id: string, value: number) => {
    setSliderValues((current) => ({ ...current, [id]: value }));
  }, []);

  const setSliderRange = useCallback((id: string, range: SliderRange) => {
    setSliderRanges((current) => ({ ...current, [id]: range }));
  }, []);

  const togglePlay = useCallback((id: string) => {
    setPlaying((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  // Animates every "playing" slider by sweeping its value back and forth across its range.
  const playingRef = useRef(playing);
  const modelRef = useRef(model);
  const rangesRef = useRef(sliderRanges);
  useEffect(() => {
    playingRef.current = playing;
    modelRef.current = model;
    rangesRef.current = sliderRanges;
  }, [playing, model, sliderRanges]);

  useEffect(() => {
    const anyPlaying = Object.values(playing).some(Boolean);
    if (!anyPlaying) return;
    let frame = 0;
    function tick(time: number) {
      setSliderValues((current) => {
        let changed = false;
        const next = { ...current };
        for (const entry of modelRef.current) {
          if (entry.row.type !== 'slider' || !playingRef.current[entry.id]) continue;
          const range = rangesRef.current[entry.id] ?? defaultSliderRange(entry.row.declaredDefault);
          // A stable per-slider period and phase offset (derived from its id) so several
          // playing sliders drift in and out of sync instead of pulsing in mechanical lockstep.
          const seed = [...entry.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
          const cycleMs = 3200 + (seed % 5) * 700;
          const phaseOffset = (seed % 10) / 10;
          const phase = (((time % cycleMs) / cycleMs) + phaseOffset) % 1;
          const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2;
          next[entry.id] = range.min + (range.max - range.min) * triangle;
          changed = true;
        }
        return changed ? next : current;
      });
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const panBy = useCallback((dxScreen: number, dyScreen: number) => {
    setViewport((current) => ({
      ...current,
      centerX: current.centerX - dxScreen / current.scale,
      centerY: current.centerY + dyScreen / current.scale,
    }));
  }, []);

  const zoomAt = useCallback((screenX: number, screenY: number, width: number, height: number, factor: number) => {
    setViewport((current) => {
      const [worldX, worldY] = screenToWorld(current, width, height, screenX, screenY);
      const nextScale = clampScale(current.scale * factor);
      const [newWorldX, newWorldY] = screenToWorld({ ...current, scale: nextScale }, width, height, screenX, screenY);
      return {
        scale: nextScale,
        centerX: current.centerX + (worldX - newWorldX),
        centerY: current.centerY + (worldY - newWorldY),
      };
    });
  }, []);

  // Drag/wheel/pinch already feel animated since they fire continuously; button-triggered
  // zoom and reset instead ease over a fixed duration so they don't just snap into place.
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);
  const viewportAnimationRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (viewportAnimationRef.current !== null) cancelAnimationFrame(viewportAnimationRef.current);
  }, []);

  const animateViewportTo = useCallback((target: Viewport, duration = 280) => {
    if (viewportAnimationRef.current !== null) cancelAnimationFrame(viewportAnimationRef.current);
    const start = performance.now();
    const from = viewportRef.current;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setViewport({
        centerX: from.centerX + (target.centerX - from.centerX) * eased,
        centerY: from.centerY + (target.centerY - from.centerY) * eased,
        scale: from.scale + (target.scale - from.scale) * eased,
      });
      viewportAnimationRef.current = t < 1 ? requestAnimationFrame(tick) : null;
    }
    viewportAnimationRef.current = requestAnimationFrame(tick);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const current = viewportRef.current;
      animateViewportTo({ ...current, scale: clampScale(current.scale * factor) });
    },
    [animateViewportTo],
  );

  const resetView = useCallback(() => animateViewportTo(DEFAULT_VIEWPORT), [animateViewportTo]);

  return {
    rows,
    model,
    sliderValues,
    playing,
    viewport,
    rangeFor,
    addRow,
    loadExamples,
    clearAll,
    updateRowText,
    removeRow,
    toggleHidden,
    setColor,
    reorderRow,
    setSliderValue,
    setSliderRange,
    togglePlay,
    panBy,
    zoomAt,
    zoomBy,
    resetView,
    setViewport,
  };
}

export type GraphingCalculator = ReturnType<typeof useGraphingCalculator>;
