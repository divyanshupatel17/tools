/**
 * The custom QR rendering engine. `qrcode`'s `create()` only gives back a dark/light module
 * matrix — everything about how that matrix becomes pixels (module shapes, finder eye shapes,
 * colours, gradients, quiet zone, a logo) lives here, shared between the live canvas preview
 * and the SVG export so the two always match exactly.
 */

import QRCode from 'qrcode';

export type BodyShape =
  | 'square'
  | 'dots'
  | 'rounded'
  | 'extra-rounded'
  | 'diamond'
  | 'gapped-square'
  | 'classy'
  | 'classy-rounded';
export type EyeShape = 'square' | 'rounded' | 'circle' | 'leaf' | 'leaf-alt' | 'shield';
export type EccLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrFill {
  kind: 'solid' | 'gradient';
  color: string;
  color2: string;
  gradientType: 'linear' | 'radial';
  angle: number;
}

export interface QrLogoStyle {
  /** A data URL, so the SVG export can embed it directly with no async step. */
  dataUrl: string;
  bitmap: ImageBitmap;
  sizePercent: number;
  padding: boolean;
  paddingColor: string;
}

export interface QrStyle {
  bodyShape: BodyShape;
  eyeFrameShape: EyeShape;
  eyeBallShape: EyeShape;
  foreground: QrFill;
  eyeFrameColor: string | null;
  eyeBallColor: string | null;
  backgroundTransparent: boolean;
  backgroundColor: string;
  margin: number;
  errorCorrectionLevel: EccLevel;
  logo: QrLogoStyle | null;
}

export interface QrInstruction {
  d: string;
  role: 'body' | 'frame' | 'ball';
  evenOdd?: boolean;
}

export interface QrLayout {
  /** Modules per side of the raw symbol, quiet zone excluded. */
  size: number;
  /** `size` plus the quiet zone on both sides — the coordinate space every path is drawn in. */
  totalModules: number;
  instructions: QrInstruction[];
}

const MAX_CONTENT_LENGTH = 2953; // QR version 40, error correction L, byte mode ceiling.

/** Builds a QR symbol at the lowest error correction that still fits, unless `ecc` is forced. */
export function encodeQr(content: string, ecc: EccLevel) {
  return QRCode.create(content, { errorCorrectionLevel: ecc });
}

export function contentFitsQr(content: string): boolean {
  return content.length > 0 && content.length <= MAX_CONTENT_LENGTH;
}

function isFinderZone(row: number, col: number, size: number): boolean {
  return (row < 7 && col < 7) || (row < 7 && col >= size - 7) || (row >= size - 7 && col < 7);
}

/** Elliptical-arc rounded rect in local (unscaled) module units, corners in [tl, tr, br, bl] order. */
function roundedRectPath(x: number, y: number, w: number, h: number, radii: [number, number, number, number]): string {
  const maxR = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, maxR))) as [number, number, number, number];
  return [
    `M${x + tl},${y}`,
    `L${x + w - tr},${y}`,
    tr > 0 ? `A${tr},${tr} 0 0 1 ${x + w},${y + tr}` : `L${x + w},${y}`,
    `L${x + w},${y + h - br}`,
    br > 0 ? `A${br},${br} 0 0 1 ${x + w - br},${y + h}` : `L${x + w},${y + h}`,
    `L${x + bl},${y + h}`,
    bl > 0 ? `A${bl},${bl} 0 0 1 ${x},${y + h - bl}` : `L${x},${y + h}`,
    `L${x},${y + tl}`,
    tl > 0 ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : `L${x},${y}`,
    'Z',
  ].join(' ');
}

function diamondPath(x: number, y: number, w: number, h: number): string {
  return `M${x + w / 2},${y} L${x + w},${y + h / 2} L${x + w / 2},${y + h} L${x},${y + h / 2} Z`;
}

function moduleRadii(
  shape: BodyShape,
  size: number,
  neighbors: { top: boolean; bottom: boolean; left: boolean; right: boolean },
): [number, number, number, number] {
  if (shape === 'square' || shape === 'diamond' || shape === 'gapped-square') return [0, 0, 0, 0];
  if (shape === 'dots') {
    const r = size / 2;
    return [r, r, r, r];
  }
  if (shape === 'classy') {
    const r = size * 0.5;
    return [r, 0, r, 0];
  }
  if (shape === 'classy-rounded') {
    const r = size * 0.5;
    return [!neighbors.top && !neighbors.left ? r : 0, 0, !neighbors.bottom && !neighbors.right ? r : 0, 0];
  }
  const r = size * (shape === 'extra-rounded' ? 0.5 : 0.32);
  return [
    !neighbors.top && !neighbors.left ? r : 0,
    !neighbors.top && !neighbors.right ? r : 0,
    !neighbors.bottom && !neighbors.right ? r : 0,
    !neighbors.bottom && !neighbors.left ? r : 0,
  ];
}

function eyeRadii(shape: EyeShape, size: number): [number, number, number, number] {
  switch (shape) {
    case 'square':
      return [0, 0, 0, 0];
    case 'rounded': {
      const r = size * 0.28;
      return [r, r, r, r];
    }
    case 'circle': {
      const r = size / 2;
      return [r, r, r, r];
    }
    case 'leaf': {
      const r = size * 0.55;
      return [r, 0, r, 0];
    }
    case 'leaf-alt': {
      const r = size * 0.55;
      return [0, r, 0, r];
    }
    case 'shield': {
      const r = size * 0.45;
      return [r, r, 0, 0];
    }
  }
}

/** Computes every filled path the symbol needs, in module-unit coordinates (quiet zone included). */
export function computeQrLayout(content: string, style: QrStyle): QrLayout {
  const qr = encodeQr(content, style.errorCorrectionLevel);
  const size = qr.modules.size;
  const margin = Math.max(0, style.margin);
  const totalModules = size + margin * 2;
  const isDark = (row: number, col: number): boolean =>
    row >= 0 && row < size && col >= 0 && col < size && qr.modules.get(row, col) === 1;

  const instructions: QrInstruction[] = [];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (isFinderZone(row, col, size)) continue;
      if (!isDark(row, col)) continue;
      const x = col + margin;
      const y = row + margin;
      if (style.bodyShape === 'diamond') {
        instructions.push({ d: diamondPath(x, y, 1, 1), role: 'body' });
        continue;
      }
      if (style.bodyShape === 'gapped-square') {
        const inset = 0.14;
        instructions.push({
          d: roundedRectPath(x + inset, y + inset, 1 - inset * 2, 1 - inset * 2, [0, 0, 0, 0]),
          role: 'body',
        });
        continue;
      }
      const radii = moduleRadii(style.bodyShape, 1, {
        top: isDark(row - 1, col),
        bottom: isDark(row + 1, col),
        left: isDark(row, col - 1),
        right: isDark(row, col + 1),
      });
      instructions.push({ d: roundedRectPath(x, y, 1, 1, radii), role: 'body' });
    }
  }

  const corners: [number, number][] = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [cornerRow, cornerCol] of corners) {
    const fx = cornerCol + margin;
    const fy = cornerRow + margin;
    const frameRadii = eyeRadii(style.eyeFrameShape, 7);
    const holeRadii = eyeRadii(style.eyeFrameShape, 5).map((r) => Math.max(0, r - 1)) as [
      number,
      number,
      number,
      number,
    ];
    const outer = roundedRectPath(fx, fy, 7, 7, frameRadii);
    const inner = roundedRectPath(fx + 1, fy + 1, 5, 5, holeRadii);
    instructions.push({ d: `${outer} ${inner}`, role: 'frame', evenOdd: true });

    const ballRadii = eyeRadii(style.eyeBallShape, 3);
    instructions.push({ d: roundedRectPath(fx + 2, fy + 2, 3, 3, ballRadii), role: 'ball' });
  }

  return { size, totalModules, instructions };
}

function linearGradientVector(angle: number): { x1: number; y1: number; x2: number; y2: number } {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad) / 2;
  const dy = Math.sin(rad) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

function logoBoxSize(totalModules: number, sizePercent: number): number {
  return totalModules * (Math.max(5, Math.min(40, sizePercent)) / 100);
}

function relativeLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return 0;
  const [r, g, b] = [match[1]!, match[2]!, match[3]!].map((c) => parseInt(c, 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** The finder eyes anchor detection for every scanner, so they always render in one flat,
 *  solid colour — the darker of the two gradient stops when the body uses a gradient — rather
 *  than sampling a position dependent gradient that can leave one eye far lighter than another
 *  and break detection, unless the user has picked an explicit eye colour of their own. */
function defaultEyeColor(foreground: QrFill): string {
  if (foreground.kind === 'solid') return foreground.color;
  return relativeLuminance(foreground.color) <= relativeLuminance(foreground.color2)
    ? foreground.color
    : foreground.color2;
}

/** Renders a computed layout onto a canvas. `sizePx` is the final square pixel size. */
export function drawQrToCanvas(canvas: HTMLCanvasElement, content: string, style: QrStyle, sizePx: number): void {
  const layout = computeQrLayout(content, style);
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
  canvas.width = Math.round(sizePx * dpr);
  canvas.height = Math.round(sizePx * dpr);
  canvas.style.width = `${sizePx}px`;
  canvas.style.height = `${sizePx}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale((sizePx * dpr) / layout.totalModules, (sizePx * dpr) / layout.totalModules);

  if (!style.backgroundTransparent) {
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(0, 0, layout.totalModules, layout.totalModules);
  }

  let bodyFill: string | CanvasGradient;
  if (style.foreground.kind === 'solid') {
    bodyFill = style.foreground.color;
  } else if (style.foreground.gradientType === 'radial') {
    const grad = ctx.createRadialGradient(
      layout.totalModules / 2,
      layout.totalModules / 2,
      0,
      layout.totalModules / 2,
      layout.totalModules / 2,
      layout.totalModules / 2,
    );
    grad.addColorStop(0, style.foreground.color);
    grad.addColorStop(1, style.foreground.color2);
    bodyFill = grad;
  } else {
    const v = linearGradientVector(style.foreground.angle);
    const grad = ctx.createLinearGradient(
      v.x1 * layout.totalModules,
      v.y1 * layout.totalModules,
      v.x2 * layout.totalModules,
      v.y2 * layout.totalModules,
    );
    grad.addColorStop(0, style.foreground.color);
    grad.addColorStop(1, style.foreground.color2);
    bodyFill = grad;
  }

  const eyeDefault = defaultEyeColor(style.foreground);
  const roleFill: Record<QrInstruction['role'], string | CanvasGradient> = {
    body: bodyFill,
    frame: style.eyeFrameColor ?? eyeDefault,
    ball: style.eyeBallColor ?? eyeDefault,
  };

  for (const instruction of layout.instructions) {
    ctx.fillStyle = roleFill[instruction.role];
    ctx.fill(new Path2D(instruction.d), instruction.evenOdd ? 'evenodd' : 'nonzero');
  }

  if (style.logo) {
    const box = logoBoxSize(layout.totalModules, style.logo.sizePercent);
    const cx = layout.totalModules / 2;
    const cy = layout.totalModules / 2;
    if (style.logo.padding) {
      const pad = box * 1.18;
      ctx.fillStyle = style.logo.paddingColor;
      ctx.fillRect(cx - pad / 2, cy - pad / 2, pad, pad);
    }
    const { bitmap } = style.logo;
    const ratio = bitmap.width / bitmap.height;
    const w = ratio >= 1 ? box : box * ratio;
    const h = ratio >= 1 ? box / ratio : box;
    ctx.drawImage(bitmap, cx - w / 2, cy - h / 2, w, h);
  }

  ctx.restore();
}

/** Builds a standalone SVG document string matching the canvas render pixel for pixel. */
export function buildQrSvg(content: string, style: QrStyle, sizePx: number): string {
  const layout = computeQrLayout(content, style);
  const gradientId = 'qr-fg-gradient';
  let defs = '';
  let bodyFillRef = style.foreground.color;

  if (style.foreground.kind === 'gradient') {
    bodyFillRef = `url(#${gradientId})`;
    if (style.foreground.gradientType === 'radial') {
      defs = `<radialGradient id="${gradientId}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${style.foreground.color}"/><stop offset="100%" stop-color="${style.foreground.color2}"/></radialGradient>`;
    } else {
      const v = linearGradientVector(style.foreground.angle);
      defs = `<linearGradient id="${gradientId}" x1="${v.x1}" y1="${v.y1}" x2="${v.x2}" y2="${v.y2}"><stop offset="0%" stop-color="${style.foreground.color}"/><stop offset="100%" stop-color="${style.foreground.color2}"/></linearGradient>`;
    }
  }

  const eyeDefault = defaultEyeColor(style.foreground);
  const roleFill: Record<QrInstruction['role'], string> = {
    body: bodyFillRef,
    frame: style.eyeFrameColor ?? eyeDefault,
    ball: style.eyeBallColor ?? eyeDefault,
  };

  const background = style.backgroundTransparent
    ? ''
    : `<rect x="0" y="0" width="${layout.totalModules}" height="${layout.totalModules}" fill="${style.backgroundColor}"/>`;

  const paths = layout.instructions
    .map(
      (instruction) =>
        `<path d="${instruction.d}" fill="${roleFill[instruction.role]}"${
          instruction.evenOdd ? ' fill-rule="evenodd"' : ''
        }/>`,
    )
    .join('');

  let logoMarkup = '';
  if (style.logo) {
    const box = logoBoxSize(layout.totalModules, style.logo.sizePercent);
    const cx = layout.totalModules / 2;
    const cy = layout.totalModules / 2;
    const ratio = style.logo.bitmap.width / style.logo.bitmap.height;
    const w = ratio >= 1 ? box : box * ratio;
    const h = ratio >= 1 ? box / ratio : box;
    const backing = style.logo.padding
      ? `<rect x="${cx - (box * 1.18) / 2}" y="${cy - (box * 1.18) / 2}" width="${box * 1.18}" height="${box * 1.18}" fill="${style.logo.paddingColor}"/>`
      : '';
    logoMarkup = `${backing}<image href="${style.logo.dataUrl}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${layout.totalModules} ${layout.totalModules}">${
    defs ? `<defs>${defs}</defs>` : ''
  }${background}${paths}${logoMarkup}</svg>`;
}
