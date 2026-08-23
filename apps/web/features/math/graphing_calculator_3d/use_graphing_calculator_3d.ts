'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { RowState, SliderRange } from '../shared/expression_types';
import { colorForIndex } from '../graphing_calculator/model';
import { buildGraphModel3d, defaultSliderRange, type RowResult3d } from './model';
import {
  clampDistance,
  clampElevation,
  DEFAULT_ORBIT,
  orbitBasis,
  type OrbitState,
} from './orbit_camera';

export type { RowState, SliderRange };

let rowIdCounter = 0;
function nextRowId(): string {
  rowIdCounter += 1;
  return `expr3d${rowIdCounter}`;
}

const INITIAL_ROWS: RowState[] = [
  { id: nextRowId(), raw: 'z=a*sin(sqrt(x^2+y^2))', color: colorForIndex(0), hidden: false },
  { id: nextRowId(), raw: 'a=1', color: colorForIndex(1), hidden: false },
];

/**
 * Kept light on purpose (lesson from the 2D tool's "load examples" once being too heavy):
 * only the animated surface resamples every frame; the isosurface, the inequality and the
 * point are all static, computed once at load.
 */
const EXAMPLE_EXPRESSIONS = ['a=1', 'z=a*sin(x)*cos(y)', 'x^2+y^2+z^2=9', 'x+y+z<-2', '(3,3,3)'] as const;
const EXAMPLE_SLIDER_COUNT = 1;
const EXAMPLE_SLIDER_RANGE: SliderRange = { min: 0.2, max: 2.5, step: 0.02 };

export function useGraphingCalculator3d() {
  const [rows, setRows] = useState<RowState[]>(INITIAL_ROWS);
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});
  const [sliderRanges, setSliderRanges] = useState<Record<string, SliderRange>>({});
  const [playing, setPlaying] = useState<Record<string, boolean>>({});
  const [orbit, setOrbit] = useState<OrbitState>(DEFAULT_ORBIT);

  const model: RowResult3d[] = useMemo(() => buildGraphModel3d(rows, sliderValues), [rows, sliderValues]);

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

  // Continuous, unanimated updates for drag/wheel/pinch (they already feel animated since they
  // fire every pointer event); orbitBy/panBy are called directly from the canvas's handlers.
  const orbitBy = useCallback((dAzimuth: number, dElevation: number) => {
    setOrbit((current) => ({
      ...current,
      azimuth: current.azimuth + dAzimuth,
      elevation: clampElevation(current.elevation + dElevation),
    }));
  }, []);

  const panBy = useCallback((dxScreen: number, dyScreen: number, viewHeightPx: number, fovRadians: number) => {
    setOrbit((current) => {
      const worldPerPixel = (2 * current.distance * Math.tan(fovRadians / 2)) / Math.max(1, viewHeightPx);
      const { right, up } = orbitBasis(current);
      const dx = -dxScreen * worldPerPixel;
      const dy = dyScreen * worldPerPixel;
      return {
        ...current,
        target: [
          current.target[0] + right[0] * dx + up[0] * dy,
          current.target[1] + right[1] * dx + up[1] * dy,
          current.target[2] + right[2] * dx + up[2] * dy,
        ],
      };
    });
  }, []);

  const dollyBy = useCallback((factor: number) => {
    setOrbit((current) => ({ ...current, distance: clampDistance(current.distance / factor) }));
  }, []);

  // Button-triggered zoom/reset ease over a fixed duration instead of snapping into place,
  // matching the 2D Graphing Calculator's `animateViewportTo` pattern.
  const orbitRef = useRef(orbit);
  useEffect(() => {
    orbitRef.current = orbit;
  }, [orbit]);
  const animationRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    },
    [],
  );

  const animateOrbitTo = useCallback((target: OrbitState, duration = 280) => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    const start = performance.now();
    const from = orbitRef.current;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setOrbit({
        azimuth: from.azimuth + (target.azimuth - from.azimuth) * eased,
        elevation: from.elevation + (target.elevation - from.elevation) * eased,
        distance: from.distance + (target.distance - from.distance) * eased,
        target: [
          from.target[0] + (target.target[0] - from.target[0]) * eased,
          from.target[1] + (target.target[1] - from.target[1]) * eased,
          from.target[2] + (target.target[2] - from.target[2]) * eased,
        ],
      });
      animationRef.current = t < 1 ? requestAnimationFrame(tick) : null;
    }
    animationRef.current = requestAnimationFrame(tick);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const current = orbitRef.current;
      animateOrbitTo({ ...current, distance: clampDistance(current.distance / factor) });
    },
    [animateOrbitTo],
  );

  const resetView = useCallback(() => animateOrbitTo(DEFAULT_ORBIT), [animateOrbitTo]);

  /** Snaps the view to look straight down one axis, keeping the current distance and target. */
  const snapView = useCallback(
    (azimuth: number, elevation: number) => {
      const current = orbitRef.current;
      animateOrbitTo({ ...current, azimuth, elevation: clampElevation(elevation) });
    },
    [animateOrbitTo],
  );

  return {
    rows,
    model,
    sliderValues,
    playing,
    orbit,
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
    orbitBy,
    panBy,
    dollyBy,
    zoomBy,
    resetView,
    snapView,
    setOrbit,
  };
}

export type GraphingCalculator3d = ReturnType<typeof useGraphingCalculator3d>;
