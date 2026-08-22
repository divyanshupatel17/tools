import type { ClassifiedRow, Comparator } from './model';
import { screenToWorld, ticksFor, visibleWorldBounds, worldToScreen, type Viewport } from './viewport';
import type { Scope } from './parser';

export interface RenderRow {
  id: string;
  color: string;
  hidden: boolean;
  row: ClassifiedRow;
}

export interface GraphTheme {
  background: string;
  gridMinor: string;
  gridMajor: string;
  axis: string;
  axisLabel: string;
}

export interface HoverInfo {
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  color: string;
}

export interface RenderOptions {
  width: number;
  height: number;
  dpr: number;
  viewport: Viewport;
  rows: RenderRow[];
  params: Scope;
  theme: GraphTheme;
  hover: HoverInfo | null;
}

const SAMPLES_PER_PIXEL = 2;
const MAX_SAMPLES = 6000;

function formatAxisNumber(value: number): string {
  if (Math.abs(value) < 1e-9) return '0';
  return Number(value.toPrecision(10)).toString();
}

function drawGrid(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { width, height, viewport, theme } = options;
  const bounds = visibleWorldBounds(viewport, width, height);
  const xTicks = ticksFor(bounds.xMin, bounds.xMax, width / 90);
  const yTicks = ticksFor(bounds.yMin, bounds.yMax, height / 70);

  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.gridMinor;
  ctx.beginPath();
  for (const x of xTicks) {
    const [sx] = worldToScreen(viewport, width, height, x, 0);
    ctx.moveTo(sx + 0.5, 0);
    ctx.lineTo(sx + 0.5, height);
  }
  for (const y of yTicks) {
    const [, sy] = worldToScreen(viewport, width, height, 0, y);
    ctx.moveTo(0, sy + 0.5);
    ctx.lineTo(width, sy + 0.5);
  }
  ctx.stroke();

  const [originX, originY] = worldToScreen(viewport, width, height, 0, 0);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = theme.axis;
  ctx.beginPath();
  ctx.moveTo(originX + 0.5, 0);
  ctx.lineTo(originX + 0.5, height);
  ctx.moveTo(0, originY + 0.5);
  ctx.lineTo(width, originY + 0.5);
  ctx.stroke();

  ctx.fillStyle = theme.axisLabel;
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  for (const x of xTicks) {
    if (Math.abs(x) < 1e-9) continue;
    const [sx] = worldToScreen(viewport, width, height, x, 0);
    const labelY = originY >= 0 && originY <= height - 16 ? originY + 4 : 4;
    ctx.fillText(formatAxisNumber(x), sx + 3, labelY);
  }
  ctx.textBaseline = 'bottom';
  for (const y of yTicks) {
    if (Math.abs(y) < 1e-9) continue;
    const [, sy] = worldToScreen(viewport, width, height, 0, y);
    const labelX = originX >= 0 && originX <= width - 28 ? originX + 4 : 4;
    ctx.fillText(formatAxisNumber(y), labelX, sy - 2);
  }
}

/** Screen-space jump large enough that two samples must belong to different asymptote branches. */
function isBreak(y1: number, y2: number, height: number): boolean {
  if (!Number.isFinite(y1) || !Number.isFinite(y2)) return true;
  return Math.abs(y1 - y2) > height * 3;
}

function drawFunctionY(ctx: CanvasRenderingContext2D, options: RenderOptions, color: string, evaluate: (x: number, params: Scope) => number): void {
  const { width, height, viewport, params } = options;
  const bounds = visibleWorldBounds(viewport, width, height);
  const samples = Math.min(MAX_SAMPLES, Math.round(width * SAMPLES_PER_PIXEL));
  const step = (bounds.xMax - bounds.xMin) / samples;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let previousScreenY: number | null = null;
  let drawing = false;
  for (let i = 0; i <= samples; i++) {
    const x = bounds.xMin + i * step;
    const y = evaluate(x, params);
    const [sx, sy] = worldToScreen(viewport, width, height, x, y);
    const finite = Number.isFinite(y);
    if (!finite || (previousScreenY !== null && isBreak(previousScreenY, sy, height))) {
      drawing = false;
    } else if (!drawing) {
      ctx.moveTo(sx, sy);
      drawing = true;
    } else {
      ctx.lineTo(sx, sy);
    }
    previousScreenY = finite ? sy : null;
  }
  ctx.stroke();
}

function drawFunctionX(ctx: CanvasRenderingContext2D, options: RenderOptions, color: string, evaluate: (y: number, params: Scope) => number): void {
  const { width, height, viewport, params } = options;
  const bounds = visibleWorldBounds(viewport, width, height);
  const samples = Math.min(MAX_SAMPLES, Math.round(height * SAMPLES_PER_PIXEL));
  const step = (bounds.yMax - bounds.yMin) / samples;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  let previousScreenX: number | null = null;
  let drawing = false;
  for (let i = 0; i <= samples; i++) {
    const y = bounds.yMax - i * step;
    const x = evaluate(y, params);
    const [sx, sy] = worldToScreen(viewport, width, height, x, y);
    const finite = Number.isFinite(x);
    if (!finite || (previousScreenX !== null && isBreak(previousScreenX, sx, width))) {
      drawing = false;
    } else if (!drawing) {
      ctx.moveTo(sx, sy);
      drawing = true;
    } else {
      ctx.lineTo(sx, sy);
    }
    previousScreenX = finite ? sx : null;
  }
  ctx.stroke();
}

const GRID_CELL_PX = 2;

/** Marching squares: draws every zero crossing segment of `evaluate(x,y) = 0` inside the view. */
function marchImplicit(ctx: CanvasRenderingContext2D, options: RenderOptions, color: string, evaluate: (x: number, y: number, params: Scope) => number): void {
  const { width, height, viewport, params } = options;
  const cols = Math.max(2, Math.ceil(width / GRID_CELL_PX));
  const rows = Math.max(2, Math.ceil(height / GRID_CELL_PX));
  const cellW = width / cols;
  const cellH = height / rows;

  const grid: number[][] = [];
  for (let j = 0; j <= rows; j++) {
    const rowValues: number[] = [];
    for (let i = 0; i <= cols; i++) {
      const sx = i * cellW;
      const sy = j * cellH;
      const wx = viewport.centerX + (sx - width / 2) / viewport.scale;
      const wy = viewport.centerY - (sy - height / 2) / viewport.scale;
      rowValues.push(evaluate(wx, wy, params));
    }
    grid.push(rowValues);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const lerp = (a: number, b: number, va: number, vb: number) => a + ((0 - va) / (vb - va)) * (b - a);

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const tl = grid[j]?.[i];
      const tr = grid[j]?.[i + 1];
      const bl = grid[j + 1]?.[i];
      const br = grid[j + 1]?.[i + 1];
      if (tl === undefined || tr === undefined || bl === undefined || br === undefined) continue;
      if (![tl, tr, bl, br].every(Number.isFinite)) continue;
      const x0 = i * cellW;
      const x1 = (i + 1) * cellW;
      const y0 = j * cellH;
      const y1 = (j + 1) * cellH;

      const points: [number, number][] = [];
      if ((tl > 0) !== (tr > 0)) points.push([lerp(x0, x1, tl, tr), y0]);
      if ((tr > 0) !== (br > 0)) points.push([x1, lerp(y0, y1, tr, br)]);
      if ((bl > 0) !== (br > 0)) points.push([lerp(x0, x1, bl, br), y1]);
      if ((tl > 0) !== (bl > 0)) points.push([x0, lerp(y0, y1, tl, bl)]);

      if (points.length === 2) {
        ctx.moveTo(points[0]?.[0] as number, points[0]?.[1] as number);
        ctx.lineTo(points[1]?.[0] as number, points[1]?.[1] as number);
      } else if (points.length === 4) {
        // Saddle case: pair opposite edges through the cell centre average to avoid a false gap.
        ctx.moveTo(points[0]?.[0] as number, points[0]?.[1] as number);
        ctx.lineTo(points[1]?.[0] as number, points[1]?.[1] as number);
        ctx.moveTo(points[2]?.[0] as number, points[2]?.[1] as number);
        ctx.lineTo(points[3]?.[0] as number, points[3]?.[1] as number);
      }
    }
  }
  ctx.stroke();
}

function satisfies(comparator: Comparator, value: number): boolean {
  switch (comparator) {
    case '<':
      return value < 0;
    case '<=':
      return value <= 0;
    case '>':
      return value > 0;
    case '>=':
      return value >= 0;
  }
}

function drawInequality(ctx: CanvasRenderingContext2D, options: RenderOptions, color: string, comparator: Comparator, evaluate: (x: number, y: number, params: Scope) => number): void {
  const { width, height, viewport, params } = options;
  const cellPx = GRID_CELL_PX * 2;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.18;
  for (let sy = 0; sy < height; sy += cellPx) {
    for (let sx = 0; sx < width; sx += cellPx) {
      const wx = viewport.centerX + (sx + cellPx / 2 - width / 2) / viewport.scale;
      const wy = viewport.centerY - (sy + cellPx / 2 - height / 2) / viewport.scale;
      const value = evaluate(wx, wy, params);
      if (Number.isFinite(value) && satisfies(comparator, value)) {
        ctx.fillRect(sx, sy, cellPx, cellPx);
      }
    }
  }
  ctx.globalAlpha = 1;
  marchImplicit(ctx, options, color, evaluate);
}

function drawPoint(ctx: CanvasRenderingContext2D, options: RenderOptions, color: string, x: number, y: number): void {
  const { width, height, viewport } = options;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const [sx, sy] = worldToScreen(viewport, width, height, x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx, sy, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawHover(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { hover, width, height, theme } = options;
  if (!hover) return;
  ctx.save();
  ctx.strokeStyle = theme.gridMajor;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hover.screenX, 0);
  ctx.lineTo(hover.screenX, height);
  ctx.moveTo(0, hover.screenY);
  ctx.lineTo(width, hover.screenY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = hover.color;
  ctx.beginPath();
  ctx.arc(hover.screenX, hover.screenY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.background;
  ctx.stroke();

  const label = `(${Number(hover.worldX.toPrecision(6))}, ${Number(hover.worldY.toPrecision(6))})`;
  ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
  const paddingX = 8;
  const textWidth = ctx.measureText(label).width;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = 24;
  let boxX = hover.screenX + 12;
  let boxY = hover.screenY - boxHeight - 10;
  if (boxX + boxWidth > width) boxX = hover.screenX - boxWidth - 12;
  if (boxY < 0) boxY = hover.screenY + 12;

  ctx.fillStyle = theme.background;
  ctx.strokeStyle = theme.axis;
  ctx.lineWidth = 1;
  const radius = 6;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, radius);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = theme.axisLabel;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, boxX + paddingX, boxY + boxHeight / 2 + 1);
  ctx.restore();
}

export function renderGraph(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { width, height, dpr, theme } = options;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, options);

  for (const entry of options.rows) {
    if (entry.hidden) continue;
    const { row, color } = entry;
    switch (row.type) {
      case 'function-y':
        drawFunctionY(ctx, options, color, row.evaluate);
        break;
      case 'function-x':
        drawFunctionX(ctx, options, color, row.evaluate);
        break;
      case 'implicit':
        marchImplicit(ctx, options, color, row.evaluate);
        break;
      case 'inequality':
        drawInequality(ctx, options, color, row.comparator, row.evaluate);
        break;
      case 'point':
        drawPoint(ctx, options, color, row.x, row.y);
        break;
      default:
        break;
    }
  }

  drawHover(ctx, options);
  ctx.restore();
}

/** Finds the closest sampled point on any visible traceable (function or point) row to a pointer. */
export function nearestTracePoint(
  rows: RenderRow[],
  viewport: Viewport,
  width: number,
  height: number,
  params: Scope,
  pointerScreenX: number,
  pointerScreenY: number,
): { worldX: number; worldY: number; screenX: number; screenY: number; color: string } | null {
  const THRESHOLD_PX = 28;
  let best: { distance: number; worldX: number; worldY: number; screenX: number; screenY: number; color: string } | null = null;

  for (const entry of rows) {
    if (entry.hidden) continue;
    const { row, color } = entry;
    if (row.type === 'point') {
      const [sx, sy] = worldToScreen(viewport, width, height, row.x, row.y);
      const distance = Math.hypot(sx - pointerScreenX, sy - pointerScreenY);
      if (distance < THRESHOLD_PX && (!best || distance < best.distance)) {
        best = { distance, worldX: row.x, worldY: row.y, screenX: sx, screenY: sy, color };
      }
      continue;
    }
    if (row.type === 'function-y') {
      const bounds = visibleWorldBounds(viewport, width, height);
      const [pointerWorldX] = screenToWorld(viewport, width, height, pointerScreenX, pointerScreenY);
      const span = 40 / viewport.scale;
      const xMin = Math.max(bounds.xMin, pointerWorldX - span);
      const xMax = Math.min(bounds.xMax, pointerWorldX + span);
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const x = xMin + ((xMax - xMin) * i) / steps;
        const y = row.evaluate(x, params);
        if (!Number.isFinite(y)) continue;
        const [sx, sy] = worldToScreen(viewport, width, height, x, y);
        const distance = Math.hypot(sx - pointerScreenX, sy - pointerScreenY);
        if (distance < THRESHOLD_PX && (!best || distance < best.distance)) {
          best = { distance, worldX: x, worldY: y, screenX: sx, screenY: sy, color };
        }
      }
      continue;
    }
    if (row.type === 'function-x') {
      const bounds = visibleWorldBounds(viewport, width, height);
      const [, pointerWorldY] = screenToWorld(viewport, width, height, pointerScreenX, pointerScreenY);
      const span = 40 / viewport.scale;
      const yMin = Math.max(bounds.yMin, pointerWorldY - span);
      const yMax = Math.min(bounds.yMax, pointerWorldY + span);
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const y = yMin + ((yMax - yMin) * i) / steps;
        const x = row.evaluate(y, params);
        if (!Number.isFinite(x)) continue;
        const [sx, sy] = worldToScreen(viewport, width, height, x, y);
        const distance = Math.hypot(sx - pointerScreenX, sy - pointerScreenY);
        if (distance < THRESHOLD_PX && (!best || distance < best.distance)) {
          best = { distance, worldX: x, worldY: y, screenX: sx, screenY: sy, color };
        }
      }
    }
  }
  return best;
}
