'use client';

import { useCallback, useState } from 'react';

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2;
const STEP = 0.25;

export function useWatchZoom() {
  const [value, setValue] = useState(1);
  const onZoomIn = useCallback(() => setValue((current) => Math.min(MAX_ZOOM, Math.round((current + STEP) * 100) / 100)), []);
  const onZoomOut = useCallback(() => setValue((current) => Math.max(MIN_ZOOM, Math.round((current - STEP) * 100) / 100)), []);
  return { value, onZoomIn, onZoomOut, min: MIN_ZOOM, max: MAX_ZOOM };
}
