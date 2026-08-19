/**
 * Canvas facing entry point for the Gemini watermark remover. See
 * `docs/gemini_watermark_remover_approach.md` for the algorithm this wraps and
 * `lib/image/gemini_watermark/engine.ts` for the actual detection and removal pipeline.
 */

import { createCanvas, type Canvas2D } from './canvas';
import { removeGeminiWatermark } from './gemini_watermark/engine';
import type { WatermarkPosition } from './gemini_watermark/size_catalog';

export interface WatermarkRemovalResult {
  canvas: Canvas2D;
  /** False when no watermark cleared the confidence gate; the canvas is an unmodified copy. */
  found: boolean;
  position: WatermarkPosition | null;
}

/**
 * Draws `source` onto a canvas, detects and removes the Gemini sparkle watermark, and returns
 * the result. Never throws for "no watermark found" — that is reported through `found` so the
 * caller can leave the file unchanged rather than fabricate a removal.
 */
export function removeGeminiWatermarkFromImage(
  source: CanvasImageSource,
  width: number,
  height: number,
): WatermarkRemovalResult {
  const target = createCanvas(width, height);
  target.ctx.drawImage(source, 0, 0, width, height);

  const imageData = target.ctx.getImageData(0, 0, width, height);
  const result = removeGeminiWatermark(imageData);
  target.ctx.putImageData(result.imageData, 0, 0);

  return { canvas: target, found: result.found, position: result.position };
}
