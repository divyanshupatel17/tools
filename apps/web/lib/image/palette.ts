export interface SampledColor {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  /** Share of sampled pixels, 0 to 1. Absent for a single sampled pixel. */
  share?: number;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function describeColor(r: number, g: number, b: number): SampledColor {
  return { hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`, rgb: { r, g, b }, hsl: rgbToHsl(r, g, b) };
}

type Channel = 0 | 1 | 2;

interface ColorBox {
  pixels: [number, number, number][];
}

function widestChannel(box: ColorBox): { channel: Channel; range: number } {
  let best: { channel: Channel; range: number } = { channel: 0, range: -1 };
  for (const channel of [0, 1, 2] as const) {
    let min = 255;
    let max = 0;
    for (const pixel of box.pixels) {
      const value = pixel[channel];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const range = max - min;
    if (range > best.range) best = { channel, range };
  }
  return best;
}

function averageColor(box: ColorBox): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const pixel of box.pixels) {
    r += pixel[0];
    g += pixel[1];
    b += pixel[2];
  }
  const n = box.pixels.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Splits colour boxes along their widest channel until `count` boxes exist or no box can split further. */
function medianCut(pixels: [number, number, number][], count: number): ColorBox[] {
  const boxes: ColorBox[] = [{ pixels }];

  while (boxes.length < count) {
    let splitIndex = -1;
    let splitChannel: Channel = 0;
    let splitRange = -1;

    boxes.forEach((box, index) => {
      if (box.pixels.length < 2) return;
      const { channel, range } = widestChannel(box);
      if (range > splitRange) {
        splitRange = range;
        splitChannel = channel;
        splitIndex = index;
      }
    });

    if (splitIndex === -1 || splitRange <= 0) break;

    const box = boxes[splitIndex]!;
    const sorted = [...box.pixels].sort((a, b) => a[splitChannel] - b[splitChannel]);
    const mid = Math.floor(sorted.length / 2);
    boxes.splice(splitIndex, 1, { pixels: sorted.slice(0, mid) }, { pixels: sorted.slice(mid) });
  }

  return boxes;
}

/**
 * Median cut colour quantisation over raw RGBA pixel data. Pure computation: no DOM, no
 * imports, so it can be unit tested directly with a synthetic buffer.
 */
export function quantizePixels(pixels: Uint8ClampedArray, count: number): SampledColor[] {
  const opaque: [number, number, number][] = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alpha = pixels[i + 3]!;
    if (alpha < 16) continue; // near transparent pixels are not a visible colour
    opaque.push([pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]);
  }
  if (opaque.length === 0) return [];

  const boxes = medianCut(opaque, Math.max(1, Math.min(count, opaque.length)));
  const total = opaque.length;

  return boxes
    .map((box) => {
      const [r, g, b] = averageColor(box);
      return { ...describeColor(r, g, b), share: box.pixels.length / total };
    })
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
}

/** Median cut quantisation over a downsampled copy. */
export function extractPalette(bitmap: ImageBitmap, count: number): SampledColor[] {
  const maxDimension = 100;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.drawImage(bitmap, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  return quantizePixels(data, count);
}
