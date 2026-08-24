/**
 * The viewport is a centre point plus a single pixels-per-unit scale (kept equal on both axes,
 * like Desmos, so a circle always renders round). Screen space has (0,0) at the canvas's top
 * left in CSS pixels; world space has y increasing upward.
 */
export interface Viewport {
  centerX: number;
  centerY: number;
  scale: number;
}

export const DEFAULT_VIEWPORT: Viewport = { centerX: 0, centerY: 0, scale: 60 };
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 20000;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function worldToScreen(viewport: Viewport, width: number, height: number, x: number, y: number): [number, number] {
  return [width / 2 + (x - viewport.centerX) * viewport.scale, height / 2 - (y - viewport.centerY) * viewport.scale];
}

export function screenToWorld(viewport: Viewport, width: number, height: number, sx: number, sy: number): [number, number] {
  return [viewport.centerX + (sx - width / 2) / viewport.scale, viewport.centerY - (sy - height / 2) / viewport.scale];
}

export function visibleWorldBounds(viewport: Viewport, width: number, height: number) {
  const halfWidth = width / 2 / viewport.scale;
  const halfHeight = height / 2 / viewport.scale;
  return {
    xMin: viewport.centerX - halfWidth,
    xMax: viewport.centerX + halfWidth,
    yMin: viewport.centerY - halfHeight,
    yMax: viewport.centerY + halfHeight,
  };
}

/** Picks a "nice" (1/2/5 x 10^n) tick step so grid lines land on human friendly numbers. */
export function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const niceResidual = residual < 1.5 ? 1 : residual < 3.5 ? 2 : residual < 7.5 ? 5 : 10;
  return niceResidual * magnitude;
}

export function ticksFor(min: number, max: number, targetTicks: number): number[] {
  const step = niceStep(max - min, targetTicks);
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= max + step / 1e6; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}
