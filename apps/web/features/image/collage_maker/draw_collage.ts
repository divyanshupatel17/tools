import { fitBox } from '@/lib/image/canvas';
import type { CollageLayout } from './layout_options';

export interface CollageDrawOptions {
  spacing: number;
  borderWidth: number;
  borderColor: string;
  backgroundColor: string;
}

export interface FreeCollageItem {
  image: ImageBitmap;
  x: number;
  y: number;
  width: number;
}

export interface GridCollageCell {
  image: ImageBitmap;
  /**
   * Which part of the image shows when it is wider or taller than its cell, as fractions of
   * the room the crop has to pan: 0.5, 0.5 is centered (the old fixed behavior), 0 is the
   * image's own left or top edge, 1 its right or bottom edge.
   */
  focal: { x: number; y: number };
}

function paintImage(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: ImageBitmap,
  box: { x: number; y: number; width: number; height: number },
  focal: { x: number; y: number } = { x: 0.5, y: 0.5 },
): void {
  const fitted = fitBox(
    { width: image.width, height: image.height },
    { width: box.width, height: box.height },
    'cover',
  );
  const x = box.x - (fitted.width - box.width) * focal.x;
  const y = box.y - (fitted.height - box.height) * focal.y;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();
  ctx.drawImage(image, x, y, fitted.width, fitted.height);
  ctx.restore();
}

export function drawCollage(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  cells: readonly (GridCollageCell | null)[],
  layout: CollageLayout,
  options: CollageDrawOptions,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = options.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  const spacing = Math.max(0, options.spacing);
  const border = Math.max(0, options.borderWidth);
  const cellWidth = (width - spacing * (layout.cols - 1)) / layout.cols;
  const cellHeight = (height - spacing * (layout.rows - 1)) / layout.rows;

  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.cols; col += 1) {
      const index = row * layout.cols + col;
      const x = col * (cellWidth + spacing);
      const y = row * (cellHeight + spacing);
      if (border > 0) {
        ctx.fillStyle = options.borderColor;
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }
      const cell = cells[index];
      if (!cell) continue;
      paintImage(
        ctx,
        cell.image,
        {
          x: x + border,
          y: y + border,
          width: Math.max(0, cellWidth - border * 2),
          height: Math.max(0, cellHeight - border * 2),
        },
        cell.focal,
      );
    }
  }
}

/**
 * Paints freely positioned cards back to front. `items` must already be in stacking order
 * (index 0 is the bottom of the stack), since the array order is the layer order.
 */
export function drawFreeCollage(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  items: readonly FreeCollageItem[],
  backgroundColor: string,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  for (const item of items) {
    const itemWidth = Math.max(1, item.width * width);
    const itemHeight = itemWidth * (item.image.height / item.image.width);
    paintImage(ctx, item.image, { x: item.x * width, y: item.y * height, width: itemWidth, height: itemHeight });
  }
}
