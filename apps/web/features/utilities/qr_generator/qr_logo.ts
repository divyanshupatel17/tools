import { decodeImage } from '@/lib/image/decode';
import type { QrLogoStyle } from './qr_render';

/** Decodes an uploaded logo file into both a drawable bitmap (canvas preview) and a data URL
 *  (SVG export, which cannot reference a blob it does not own). */
export async function decodeLogo(
  file: File,
  sizePercent: number,
  padding: boolean,
  paddingColor: string,
): Promise<QrLogoStyle> {
  const decoded = await decodeImage(file);
  // Re-encoded as PNG from the decoded bitmap rather than the raw upload, so an SVG <image> can
  // always render it even when the source was HEIC, TIFF, or another format browsers cannot
  // paint directly.
  const canvas = document.createElement('canvas');
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A drawing surface is not available in this browser.');
  ctx.drawImage(decoded.bitmap, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  return { dataUrl, bitmap: decoded.bitmap, sizePercent, padding, paddingColor };
}
