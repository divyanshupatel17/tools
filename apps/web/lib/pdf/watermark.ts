export interface WatermarkPosition {
  /** Center point, in PDF points from the page's bottom-left. */
  x: number;
  y: number;
}

/**
 * A single centered mark, or a diagonal repeating grid when tiled. Tiling always uses a 3×4
 * grid regardless of page size — a fixed, honest "covers the page" pattern rather than an extra
 * density control the user would have to guess a good value for.
 */
export function watermarkPositions(
  pageWidth: number,
  pageHeight: number,
  tile: boolean,
): WatermarkPosition[] {
  if (!tile) return [{ x: pageWidth / 2, y: pageHeight / 2 }];

  const columns = 3;
  const rows = 4;
  const positions: WatermarkPosition[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      positions.push({
        x: ((column + 0.5) / columns) * pageWidth,
        y: ((row + 0.5) / rows) * pageHeight,
      });
    }
  }
  return positions;
}

/**
 * `page.drawText`'s `rotate` option pivots around the given (x, y), which is the unrotated
 * text's baseline start — not its visual center. To keep a watermark centered on its tile point
 * regardless of angle, the offset from center to that baseline start has to be rotated by the
 * same angle before being added back to the center.
 */
export function centeredTextOrigin(
  centerX: number,
  centerY: number,
  textWidth: number,
  fontSize: number,
  angleDegrees: number,
): { x: number; y: number } {
  const radians = (angleDegrees * Math.PI) / 180;
  const offsetX = -textWidth / 2;
  const offsetY = -fontSize * 0.35;
  return {
    x: centerX + offsetX * Math.cos(radians) - offsetY * Math.sin(radians),
    y: centerY + offsetX * Math.sin(radians) + offsetY * Math.cos(radians),
  };
}

/** Same centering correction as `centeredTextOrigin`, for an image whose `drawImage` origin is
 * its bottom-left corner. */
export function centeredImageOrigin(
  centerX: number,
  centerY: number,
  imageWidth: number,
  imageHeight: number,
  angleDegrees: number,
): { x: number; y: number } {
  const radians = (angleDegrees * Math.PI) / 180;
  const offsetX = -imageWidth / 2;
  const offsetY = -imageHeight / 2;
  return {
    x: centerX + offsetX * Math.cos(radians) - offsetY * Math.sin(radians),
    y: centerY + offsetX * Math.sin(radians) + offsetY * Math.cos(radians),
  };
}

/** "#rrggbb" (or "#rgb") to 0-1 pdf-lib `rgb()` components. Falls back to black on anything else. */
export function hexToRgbComponents(hex: string): { r: number; g: number; b: number } {
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim());
  if (!match) return { r: 0, g: 0, b: 0 };

  const value = match[1]!;
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;

  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}
