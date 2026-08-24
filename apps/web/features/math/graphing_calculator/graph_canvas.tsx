'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { nearestTracePoint, renderGraph, type GraphTheme, type RenderRow } from './canvas_renderer';
import { clampScale, type Viewport } from './viewport';
import type { Scope } from './parser';

export interface GraphCanvasHandle {
  exportPng: (pixelScale: number) => void;
}

interface GraphCanvasProps {
  rows: RenderRow[];
  params: Scope;
  viewport: Viewport;
  onPan: (dx: number, dy: number) => void;
  onZoom: (screenX: number, screenY: number, width: number, height: number, factor: number) => void;
  fileName: string;
}

function readTheme(): GraphTheme {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: read('--background', '#ffffff'),
    gridMinor: `color-mix(in srgb, ${read('--border', '#e5e5e5')} 70%, transparent)`,
    gridMajor: read('--border', '#e5e5e5'),
    axis: read('--muted-foreground', '#666666'),
    axisLabel: read('--muted-foreground', '#666666'),
  };
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(
  { rows, params, viewport, onPan, onZoom, fileName },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 600, height: 480 });
  const [theme, setTheme] = useState<GraphTheme>(() =>
    typeof document === 'undefined'
      ? { background: '#ffffff', gridMinor: '#e5e5e5', gridMajor: '#e5e5e5', axis: '#666666', axisLabel: '#666666' }
      : readTheme(),
  );
  const [hoverScreen, setHoverScreen] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);
  const pinchState = useRef<{ distance: number; scale: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(1, width), height: Math.max(1, height) });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setTheme(readTheme());
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMediaChange = () => setTheme(readTheme());
    media.addEventListener('change', onMediaChange);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', onMediaChange);
    };
  }, []);

  const hover =
    hoverScreen &&
    (() => {
      const trace = nearestTracePoint(rows, viewport, size.width, size.height, params, hoverScreen.x, hoverScreen.y);
      if (!trace) return null;
      return { screenX: trace.screenX, screenY: trace.screenY, worldX: trace.worldX, worldY: trace.worldY, color: trace.color };
    })();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderGraph(ctx, { width: size.width, height: size.height, dpr, viewport, rows, params, theme, hover: hover ?? null });
  }, [size, viewport, rows, params, theme, hover]);

  useImperativeHandle(ref, () => ({
    exportPng(pixelScale: number) {
      const canvas = document.createElement('canvas');
      const dpr = pixelScale;
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderGraph(ctx, { width: size.width, height: size.height, dpr, viewport, rows, params, theme, hover: null });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${fileName}.png`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        requestAnimationFrame(() => URL.revokeObjectURL(url));
      }, 'image/png');
    },
  }));

  function pointerPos(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  const activePointers = useRef(new Map<number, { x: number; y: number }>());

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const pos = pointerPos(event);
    activePointers.current.set(event.pointerId, pos);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (activePointers.current.size === 1) {
      dragState.current = { pointerId: event.pointerId, lastX: pos.x, lastY: pos.y };
    } else if (activePointers.current.size === 2) {
      dragState.current = null;
      const [a, b] = [...activePointers.current.values()];
      if (a && b) pinchState.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: viewport.scale };
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const pos = pointerPos(event);
    if (activePointers.current.has(event.pointerId)) activePointers.current.set(event.pointerId, pos);

    if (activePointers.current.size === 2 && pinchState.current) {
      const [a, b] = [...activePointers.current.values()];
      if (a && b) {
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const factor = distance / pinchState.current.distance;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        onZoom(midX, midY, size.width, size.height, factor / (viewport.scale / pinchState.current.scale));
      }
      return;
    }

    if (dragState.current && dragState.current.pointerId === event.pointerId) {
      const dx = pos.x - dragState.current.lastX;
      const dy = pos.y - dragState.current.lastY;
      dragState.current = { pointerId: event.pointerId, lastX: pos.x, lastY: pos.y };
      onPan(dx, dy);
      setHoverScreen(null);
    } else if (activePointers.current.size <= 1) {
      setHoverScreen(pos);
    }
  }

  function endPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    activePointers.current.delete(event.pointerId);
    if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
    if (activePointers.current.size < 2) pinchState.current = null;
  }

  function onWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const factor = clampScale(viewport.scale * Math.pow(1.0015, -event.deltaY)) / viewport.scale;
    onZoom(x, y, size.width, size.height, factor);
  }

  return (
    <div ref={containerRef} className="relative h-full min-h-[22rem] w-full overflow-hidden rounded-2xl border border-border">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ width: size.width, height: size.height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={() => {
          if (!dragState.current) setHoverScreen(null);
        }}
        onWheel={onWheel}
        role="img"
        aria-label="Interactive graph. Drag to pan, scroll or pinch to zoom."
      />
    </div>
  );
});
