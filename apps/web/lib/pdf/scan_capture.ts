'use client';

import {
  cropRect,
  detectDocumentCorners,
  warpPerspective,
  type Point,
  type RasterImage,
} from './scan_geometry';

/** Longest side an image is decoded to before cropping. Caps warp cost on a phone-camera photo
 * (often 4000px+) without visibly hurting a scanned document, which is text/line art, not a
 * photo that benefits from extra resolution. */
const MAX_SOURCE_SIDE = 2400;

export async function loadFileToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

export function canvasToRaster(canvas: HTMLCanvasElement): RasterImage {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available.');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data: image.data, width: image.width, height: image.height };
}

export function rasterToCanvas(raster: RasterImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available.');
  context.putImageData(
    new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height),
    0,
    0,
  );
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The image could not be encoded.'));
        return;
      }
      resolve(blob);
    }, type);
  });
}

/** Runs `detectDocumentCorners` on a downscaled copy for speed, then scales the corners back up
 * to `canvas`'s real pixel space so the caller never has to think about the analysis resolution. */
export function detectCorners(canvas: HTMLCanvasElement): [Point, Point, Point, Point] {
  const ANALYSIS_SIDE = 500;
  const scale = Math.min(1, ANALYSIS_SIDE / Math.max(canvas.width, canvas.height));

  let raster: RasterImage;
  if (scale < 1) {
    const small = document.createElement('canvas');
    small.width = Math.round(canvas.width * scale);
    small.height = Math.round(canvas.height * scale);
    const context = small.getContext('2d');
    if (!context) throw new Error('Canvas is not available.');
    context.drawImage(canvas, 0, 0, small.width, small.height);
    raster = canvasToRaster(small);
  } else {
    raster = canvasToRaster(canvas);
  }

  const corners = detectDocumentCorners(raster);
  return corners.map((point) => ({ x: point.x / scale, y: point.y / scale })) as [
    Point,
    Point,
    Point,
    Point,
  ];
}

/** Straightens `canvas` through the perspective quadrilateral `corners`, choosing an output size
 * from the corners' own average width/height so the result keeps the document's aspect ratio
 * rather than an arbitrary fixed size. */
export function applyPerspectiveCrop(
  canvas: HTMLCanvasElement,
  corners: readonly [Point, Point, Point, Point],
): HTMLCanvasElement {
  const [tl, tr, br, bl] = corners;
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const outWidth = Math.max(1, Math.round((dist(tl, tr) + dist(bl, br)) / 2));
  const outHeight = Math.max(1, Math.round((dist(tl, bl) + dist(tr, br)) / 2));

  const raster = canvasToRaster(canvas);
  const warped = warpPerspective(raster, corners, outWidth, outHeight);
  return rasterToCanvas(warped);
}

export function applyRectCrop(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
): HTMLCanvasElement {
  const raster = canvasToRaster(canvas);
  const cropped = cropRect(raster, x, y, width, height);
  return rasterToCanvas(cropped);
}

export function rotateCanvas(
  canvas: HTMLCanvasElement,
  degrees: 0 | 90 | 180 | 270,
): HTMLCanvasElement {
  if (degrees === 0) return canvas;
  const swap = degrees === 90 || degrees === 270;
  const out = document.createElement('canvas');
  out.width = swap ? canvas.height : canvas.width;
  out.height = swap ? canvas.width : canvas.height;
  const context = out.getContext('2d');
  if (!context) throw new Error('Canvas is not available.');
  context.translate(out.width / 2, out.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}
