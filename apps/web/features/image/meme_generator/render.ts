import { wrapText } from './wrap_text';

export interface MemeTextBox {
  id: string;
  /** A short label for the panel's box list, e.g. "Top caption". Not drawn. */
  label: string;
  text: string;
  /** Center point, as a 0 to 1 fraction of the image. Dragging on the preview updates this. */
  x: number;
  y: number;
  /** Authored against `DESIGN_WIDTH`; scaled to the canvas actually being painted. */
  font_size: number;
  color: string;
  outline: boolean;
  outline_color: string;
  uppercase: boolean;
}

/** The width `font_size` is authored against; see `watermark_image/render.ts` for the same idea. */
export const DESIGN_WIDTH = 500;

const MAX_WIDTH_RATIO = 0.92;
const LINE_HEIGHT_RATIO = 1.15;
const MEME_FONT = '"Arial Black", Impact, sans-serif';

function renderMemeBox(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  box: MemeTextBox,
): void {
  const displayText = (box.uppercase ? box.text.toUpperCase() : box.text).trim();
  if (!displayText) return;

  const fontScale = canvasWidth / DESIGN_WIDTH;
  const fontSize = Math.max(1, box.font_size * fontScale);
  ctx.font = `900 ${fontSize}px ${MEME_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const maxWidth = canvasWidth * MAX_WIDTH_RATIO;
  const lines = wrapText(ctx, displayText, maxWidth);
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  const totalHeight = lineHeight * lines.length;

  const centerX = box.x * canvasWidth;
  const centerY = box.y * canvasHeight;
  const startY = centerY - totalHeight / 2 + lineHeight / 2;

  ctx.fillStyle = box.color;
  ctx.strokeStyle = box.outline_color;
  ctx.lineWidth = Math.max(1, fontSize / 9);

  lines.forEach((line, index) => {
    const y = startY + index * lineHeight;
    // Outline first, fill on top — a text shadow would blur instead of the crisp classic ring
    // this style needs to read over any background.
    if (box.outline) ctx.strokeText(line, centerX, y);
    ctx.fillText(line, centerX, y);
  });
}

/** Paints every text box onto an already drawn base image. Shared by the live preview and export. */
export function renderMeme(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  boxes: readonly MemeTextBox[],
): void {
  for (const box of boxes) renderMemeBox(ctx, canvasWidth, canvasHeight, box);
}
