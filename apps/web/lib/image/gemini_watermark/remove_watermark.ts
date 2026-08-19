/**
 * Reverse alpha blending: the exact algebraic inverse of how Gemini composites its watermark.
 *
 * Ported from `blendModes.js` in GargantuaX/gemini-watermark-remover (MIT licensed).
 *
 * Gemini adds the mark as an ordinary alpha blend: `watermarked = alpha * logo + (1 - alpha) *
 * original`. Given the real per pixel alpha of the mark (see `embedded_alpha_maps.ts`), that is
 * solvable exactly: `original = (watermarked - alpha * logo) / (1 - alpha)`. This recovers the
 * real background pixel; it does not blur, inpaint or guess it.
 */

import type { WatermarkPosition } from './size_catalog';

/** Removes quantization noise the captured alpha template itself carries. */
const ALPHA_NOISE_FLOOR = 3 / 255;
/** Below this denoised alpha, treat the pixel as untouched by the mark. */
const ALPHA_THRESHOLD = 0.002;
/** Caps alpha short of 1 so the division never blows up on a fully opaque pixel. */
const MAX_ALPHA = 0.99;
const LOGO_VALUE_WHITE = 255;

export interface RemoveWatermarkOptions {
  /** Multiplies the alpha map's strength. 1 applies the calibrated template as measured. */
  alphaGain?: number;
}

/**
 * Removes the watermark from `imageData` in place, over the `width` x `height` window at
 * `position` using `alphaMap` (must be exactly `position.width * position.height` values, top
 * left origin, matching `position`).
 *
 * A negative alpha value in the map marks a dark polarity watermark (a black glyph on a light
 * background) at that pixel; the inverse blend uses a black logo value there instead of white.
 */
export function removeWatermark(
  imageData: ImageData,
  alphaMap: Float32Array,
  position: WatermarkPosition,
  options: RemoveWatermarkOptions = {},
): void {
  const { x, y, width, height } = position;
  const alphaGain =
    Number.isFinite(options.alphaGain) && (options.alphaGain ?? 0) > 0 ? options.alphaGain! : 1;

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const imgIdx = ((y + row) * imageData.width + (x + col)) * 4;
      const alphaIdx = row * width + col;

      const rawAlpha = alphaMap[alphaIdx]!;
      const alphaMagnitude = Math.abs(rawAlpha);
      const logoValue = rawAlpha < 0 ? 0 : LOGO_VALUE_WHITE;

      const signalAlpha = Math.max(0, alphaMagnitude - ALPHA_NOISE_FLOOR) * alphaGain;
      if (signalAlpha < ALPHA_THRESHOLD) continue;

      const alpha = Math.min(alphaMagnitude * alphaGain, MAX_ALPHA);
      const oneMinusAlpha = 1 - alpha;

      for (let channel = 0; channel < 3; channel += 1) {
        const watermarked = imageData.data[imgIdx + channel]!;
        const original = (watermarked - alpha * logoValue) / oneMinusAlpha;
        imageData.data[imgIdx + channel] = Math.max(0, Math.min(255, Math.round(original)));
      }
    }
  }
}
