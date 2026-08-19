import { createCanvas, type Canvas2D } from '@/lib/image/canvas';
import { buildFilterString } from './filters';
import type { Adjustments, BorderStyle, ImageLayer, Layer, Transform } from './editor_state';

export interface RenderInput {
  base: ImageBitmap;
  documentWidth: number;
  documentHeight: number;
  layers: readonly Layer[];
  /** Decoded overlay bitmaps keyed by the owning ImageLayer's id. */
  imageBitmaps: ReadonlyMap<string, ImageBitmap>;
  adjustments: Adjustments;
  border: BorderStyle;
  background: string;
  transform: Transform;
  /** Output pixels per document pixel. 1 renders at the base image's natural resolution. */
  scale: number;
}

function withLayerTransform(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rotationDeg: number,
  draw: () => void,
): void {
  if (rotationDeg === 0) {
    draw();
    return;
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  draw();
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth: number,
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLength = Math.max(10, lineWidth * 3);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle - Math.PI / 6),
    y2 - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    x2 - headLength * Math.cos(angle + Math.PI / 6),
    y2 - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  layer: Extract<Layer, { type: 'text' }>,
  scale: number,
): void {
  const x = layer.x * scale;
  const y = layer.y * scale;
  const fontSize = Math.max(1, layer.font_size * scale);
  withLayerTransform(ctx, x, y, layer.rotation, () => {
    ctx.fillStyle = layer.color;
    ctx.font = `${layer.font_weight} ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = layer.align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(layer.text, x, y);
  });
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  layer: Extract<Layer, { type: 'shape' }>,
  scale: number,
): void {
  const x = layer.x * scale;
  const y = layer.y * scale;
  const width = layer.width * scale;
  const height = layer.height * scale;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const lineWidth = Math.max(0, layer.stroke_width) * scale;

  withLayerTransform(ctx, cx, cy, layer.rotation, () => {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = layer.stroke_color;
    ctx.fillStyle = layer.fill_color ?? 'transparent';

    switch (layer.shape) {
      case 'rectangle':
        if (layer.fill_color) ctx.fillRect(x, y, width, height);
        if (lineWidth > 0) ctx.strokeRect(x, y, width, height);
        break;
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.abs(width) / 2, Math.abs(height) / 2, 0, 0, Math.PI * 2);
        if (layer.fill_color) ctx.fill();
        if (lineWidth > 0) ctx.stroke();
        break;
      case 'line':
        if (lineWidth > 0) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + width, y + height);
          ctx.stroke();
        }
        break;
      case 'arrow':
        if (lineWidth > 0) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + width, y + height);
          ctx.stroke();
          ctx.fillStyle = layer.stroke_color;
          drawArrowHead(ctx, x, y, x + width, y + height, lineWidth);
        }
        break;
      default:
        break;
    }
  });
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  layer: Extract<Layer, { type: 'path' }>,
  scale: number,
): void {
  if (layer.points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = layer.color;
  ctx.fillStyle = layer.color;
  ctx.lineWidth = Math.max(1, layer.size * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (layer.points.length === 1) {
    const only = layer.points[0]!;
    ctx.beginPath();
    ctx.arc(only.x * scale, only.y * scale, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  const [first, ...rest] = layer.points;
  ctx.moveTo(first!.x * scale, first!.y * scale);
  for (const point of rest) ctx.lineTo(point.x * scale, point.y * scale);
  ctx.stroke();
  ctx.restore();
}

function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: ImageLayer,
  scale: number,
  imageBitmaps: ReadonlyMap<string, ImageBitmap>,
): void {
  const bitmap = imageBitmaps.get(layer.id);
  if (!bitmap) return;
  const x = layer.x * scale;
  const y = layer.y * scale;
  const width = layer.width * scale;
  const height = layer.height * scale;
  const cx = x + width / 2;
  const cy = y + height / 2;
  withLayerTransform(ctx, cx, cy, layer.rotation, () => {
    ctx.drawImage(bitmap, x, y, width, height);
  });
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  scale: number,
  imageBitmaps: ReadonlyMap<string, ImageBitmap>,
): void {
  switch (layer.type) {
    case 'text':
      drawText(ctx, layer, scale);
      break;
    case 'shape':
      drawShape(ctx, layer, scale);
      break;
    case 'path':
      drawPath(ctx, layer, scale);
      break;
    case 'image':
      drawImageLayer(ctx, layer, scale, imageBitmaps);
      break;
    default:
      break;
  }
}

/**
 * Renders the full document — background, filtered base image, every layer front to back,
 * the whole composition rotated and flipped, then the border painted around the outside — at
 * `scale` output pixels per document pixel. The editor preview calls this with a small scale;
 * the processor calls it with scale 1 against the full resolution base image. Same function,
 * same math, so the export always matches what the preview showed.
 */
export function renderComposition(input: RenderInput): Canvas2D {
  const {
    base,
    documentWidth,
    documentHeight,
    layers,
    imageBitmaps,
    adjustments,
    border,
    background,
    transform,
    scale,
  } = input;

  const contentWidth = Math.max(1, documentWidth * scale);
  const contentHeight = Math.max(1, documentHeight * scale);
  const content = createCanvas(contentWidth, contentHeight);
  const cctx = content.ctx;

  cctx.fillStyle = background;
  cctx.fillRect(0, 0, contentWidth, contentHeight);

  cctx.save();
  cctx.filter = buildFilterString(adjustments, contentWidth);
  cctx.drawImage(base, 0, 0, contentWidth, contentHeight);
  cctx.restore();

  for (const layer of layers) drawLayer(cctx, layer, scale, imageBitmaps);

  const rotated = transform.rotate === 90 || transform.rotate === 270;
  const outWidth = rotated ? contentHeight : contentWidth;
  const outHeight = rotated ? contentWidth : contentHeight;
  const borderPx = Math.max(0, border.width) * scale;

  const final = createCanvas(outWidth + borderPx * 2, outHeight + borderPx * 2);
  const fctx = final.ctx;

  fctx.save();
  fctx.translate(final.canvas.width / 2, final.canvas.height / 2);
  fctx.rotate((transform.rotate * Math.PI) / 180);
  fctx.scale(transform.flip_h ? -1 : 1, transform.flip_v ? -1 : 1);
  fctx.drawImage(content.canvas, -contentWidth / 2, -contentHeight / 2);
  fctx.restore();

  if (borderPx > 0) {
    fctx.strokeStyle = border.color;
    fctx.lineWidth = borderPx;
    fctx.strokeRect(
      borderPx / 2,
      borderPx / 2,
      final.canvas.width - borderPx,
      final.canvas.height - borderPx,
    );
  }

  return final;
}
