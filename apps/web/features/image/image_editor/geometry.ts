import type { Transform } from './editor_state';

export interface StageGeometry {
  documentWidth: number;
  documentHeight: number;
  /** Output pixels per document pixel, same meaning as `RenderInput.scale` in compositor.ts. */
  scale: number;
  transform: Transform;
  borderPx: number;
}

/** Size, in output pixels, of the composition before the whole thing rotates or flips. */
export function stageContentSize(geometry: StageGeometry): { width: number; height: number } {
  return {
    width: geometry.documentWidth * geometry.scale,
    height: geometry.documentHeight * geometry.scale,
  };
}

/** Size, in output pixels, of the canvas element after rotation and the border are applied. */
export function stageFinalSize(geometry: StageGeometry): { width: number; height: number } {
  const content = stageContentSize(geometry);
  const rotated = geometry.transform.rotate === 90 || geometry.transform.rotate === 270;
  const outWidth = rotated ? content.height : content.width;
  const outHeight = rotated ? content.width : content.height;
  return { width: outWidth + geometry.borderPx * 2, height: outHeight + geometry.borderPx * 2 };
}

/**
 * Converts a pointer event's screen position into a document pixel coordinate, inverting the
 * same rotate, flip and scale that `compositor.ts` applies going forward. `wrapperRect` is the
 * bounding box of the untransformed outer element that the canvas fills exactly.
 */
export function screenToDocumentPoint(
  clientX: number,
  clientY: number,
  wrapperRect: { left: number; top: number },
  geometry: StageGeometry,
): { x: number; y: number } {
  const content = stageContentSize(geometry);
  const final = stageFinalSize(geometry);

  const px = clientX - wrapperRect.left;
  const py = clientY - wrapperRect.top;
  const relX = px - final.width / 2;
  const relY = py - final.height / 2;

  const rad = (-geometry.transform.rotate * Math.PI) / 180;
  const rx = relX * Math.cos(rad) - relY * Math.sin(rad);
  const ry = relX * Math.sin(rad) + relY * Math.cos(rad);

  const localX = geometry.transform.flip_h ? -rx : rx;
  const localY = geometry.transform.flip_v ? -ry : ry;

  const contentX = localX + content.width / 2;
  const contentY = localY + content.height / 2;

  return { x: contentX / geometry.scale, y: contentY / geometry.scale };
}
