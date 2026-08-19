/**
 * Plain data model for the image editor document. Every coordinate, size and stroke width is
 * stored in "document pixels" — the base image's natural resolution, not the preview's display
 * resolution. `compositor.ts` renders this same data at any `scale`, which is what keeps the
 * editor preview and the full resolution export in exact agreement.
 */

export type ShapeKind = 'rectangle' | 'ellipse' | 'line' | 'arrow';
export type FontWeight = 400 | 700;
export type TextAlign = 'left' | 'center' | 'right';

interface LayerCommon {
  id: string;
}

export interface TextLayer extends LayerCommon {
  type: 'text';
  x: number;
  y: number;
  text: string;
  font_size: number;
  color: string;
  font_weight: FontWeight;
  align: TextAlign;
  rotation: number;
}

export interface ShapeLayer extends LayerCommon {
  type: 'shape';
  shape: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fill_color: string | null;
  stroke_color: string;
  stroke_width: number;
  rotation: number;
}

export interface PathLayer extends LayerCommon {
  type: 'path';
  points: readonly { x: number; y: number }[];
  color: string;
  size: number;
}

export interface ImageLayer extends LayerCommon {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  file_index: number;
  rotation: number;
}

export type Layer = TextLayer | ShapeLayer | PathLayer | ImageLayer;

export interface Adjustments {
  /** 100 is neutral for brightness, contrast and saturation. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** 0 to 20. Scaled against document width, see filters.ts. */
  blur: number;
}

export interface BorderStyle {
  width: number;
  color: string;
}

export interface Transform {
  rotate: 0 | 90 | 180 | 270;
  flip_h: boolean;
  flip_v: boolean;
}

export interface EditorDocument {
  layers: Layer[];
  adjustments: Adjustments;
  border: BorderStyle;
  background: string;
  transform: Transform;
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
};
export const DEFAULT_BORDER: BorderStyle = { width: 0, color: '#1b1a17' };
export const DEFAULT_TRANSFORM: Transform = { rotate: 0, flip_h: false, flip_v: false };

export function createDocument(): EditorDocument {
  return {
    layers: [],
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    border: { ...DEFAULT_BORDER },
    background: '#ffffff',
    transform: { ...DEFAULT_TRANSFORM },
  };
}

let sequence = 0;
export function nextLayerId(): string {
  sequence += 1;
  return `layer-${sequence}`;
}

export function createTextLayer(x: number, y: number): TextLayer {
  return {
    id: nextLayerId(),
    type: 'text',
    x,
    y,
    text: 'Text',
    font_size: 48,
    color: '#1b1a17',
    font_weight: 700,
    align: 'left',
    rotation: 0,
  };
}

export function createShapeLayer(shape: ShapeKind, x: number, y: number): ShapeLayer {
  return {
    id: nextLayerId(),
    type: 'shape',
    shape,
    x,
    y,
    width: 0,
    height: 0,
    fill_color: null,
    stroke_color: '#1b1a17',
    stroke_width: 6,
    rotation: 0,
  };
}

export function createPathLayer(x: number, y: number, color: string, size: number): PathLayer {
  return { id: nextLayerId(), type: 'path', points: [{ x, y }], color, size };
}

export function createImageLayer(
  x: number,
  y: number,
  width: number,
  height: number,
  fileIndex: number,
): ImageLayer {
  return {
    id: nextLayerId(),
    type: 'image',
    x,
    y,
    width,
    height,
    file_index: fileIndex,
    rotation: 0,
  };
}

/** Axis aligned bounding box in document pixels, ignoring the layer's own rotation. */
export function layerBounds(layer: Layer): { x: number; y: number; width: number; height: number } {
  switch (layer.type) {
    case 'text': {
      // The real width depends on rendered glyph metrics; this box is only used for the
      // interactive overlay, so an estimate keyed off font size is close enough to grab.
      const width = Math.max(layer.font_size * 0.6 * (layer.text.length || 1), layer.font_size);
      // x is the anchor the compositor passes to fillText, so the box sits around it the same
      // way the canvas lays the glyphs out.
      const x =
        layer.align === 'center'
          ? layer.x - width / 2
          : layer.align === 'right'
            ? layer.x - width
            : layer.x;
      return { x, y: layer.y - layer.font_size * 0.8, width, height: layer.font_size * 1.3 };
    }
    case 'shape': {
      const x = Math.min(layer.x, layer.x + layer.width);
      const y = Math.min(layer.y, layer.y + layer.height);
      const padding = layer.stroke_width;
      return {
        x: x - padding / 2,
        y: y - padding / 2,
        width: Math.abs(layer.width) + padding,
        height: Math.abs(layer.height) + padding,
      };
    }
    case 'path': {
      const xs = layer.points.map((point) => point.x);
      const ys = layer.points.map((point) => point.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      const padding = layer.size;
      return {
        x: minX - padding,
        y: minY - padding,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
      };
    }
    case 'image':
      return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
    default:
      return { x: 0, y: 0, width: 0, height: 0 };
  }
}
