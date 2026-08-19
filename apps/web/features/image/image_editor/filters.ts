import type { Adjustments } from './editor_state';

/**
 * Blur is stored as a value tuned against an 800 document-pixel wide reference image so the
 * slider feels the same regardless of the source photo's resolution. `outputWidth` is the
 * document width times whatever scale is currently rendering (preview or full export), so the
 * device pixel blur radius grows with the export exactly as the rest of the composition does.
 */
const BLUR_REFERENCE_WIDTH = 800;

export function blurPixels(blur: number, outputWidth: number): number {
  if (blur <= 0) return 0;
  return (blur * outputWidth) / BLUR_REFERENCE_WIDTH;
}

/** CSS filter string applied only to the base image draw, never to overlay layers. */
export function buildFilterString(adjustments: Adjustments, outputWidth: number): string {
  const blur = blurPixels(adjustments.blur, outputWidth);
  const parts = [
    `brightness(${adjustments.brightness}%)`,
    `contrast(${adjustments.contrast}%)`,
    `saturate(${adjustments.saturation}%)`,
  ];
  if (blur > 0) parts.push(`blur(${blur}px)`);
  return parts.join(' ');
}
