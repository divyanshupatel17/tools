/**
 * An ICO directory entry stores width and height in one byte each, so 256 pixels is the largest
 * size the container can describe. `encodeIco` only clamps those header bytes; it never scales
 * the pixels, so anything bigger has to be scaled down before it is encoded. Kept in its own
 * module with no heavy imports so the processor and the workspace agree on the same numbers.
 */
export const ICO_MAX_SIZE = 256;

/** Scales a size down to fit inside 256 x 256, keeping the aspect ratio. */
export function fitIcoSize(
  width: number,
  height: number,
): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (longest <= ICO_MAX_SIZE) return { width, height, scaled: false };
  const scale = ICO_MAX_SIZE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  };
}
