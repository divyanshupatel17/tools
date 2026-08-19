import { describe, expect, it } from 'vitest';
import { fitBox } from '../../lib/image/canvas';
import { guessFormat, isLossy, supportsAlpha } from '../../lib/image/image_formats';
import { describeColor, quantizePixels } from '../../lib/image/palette';

describe('image_formats', () => {
  it('guesses format from mime type before falling back to extension', () => {
    expect(guessFormat(new File([], 'photo.jpg', { type: 'image/jpeg' }))).toBe('jpeg');
    expect(guessFormat(new File([], 'icon.webp', { type: '' }))).toBe('webp');
    expect(guessFormat(new File([], 'scan.heic', { type: '' }))).toBe('heic');
    expect(guessFormat(new File([], 'notes.txt', { type: 'text/plain' }))).toBeNull();
  });

  it('knows which formats keep an alpha channel', () => {
    expect(supportsAlpha('png')).toBe(true);
    expect(supportsAlpha('webp')).toBe(true);
    expect(supportsAlpha('jpeg')).toBe(false);
    expect(supportsAlpha('bmp')).toBe(true);
  });

  it('knows which formats have a meaningful quality slider', () => {
    expect(isLossy('jpeg')).toBe(true);
    expect(isLossy('avif')).toBe(true);
    expect(isLossy('png')).toBe(false);
  });
});

describe('fitBox', () => {
  const natural = { width: 1600, height: 900 };

  it('contains a wide image inside a taller box by fitting its width', () => {
    const result = fitBox(natural, { width: 800, height: 800 }, 'contain');
    expect(result.width).toBe(800);
    expect(result.height).toBeCloseTo(450);
  });

  it('covers a taller box by overfilling on the fitted axis', () => {
    const result = fitBox(natural, { width: 800, height: 800 }, 'cover');
    expect(result.height).toBe(800);
    expect(result.width).toBeCloseTo(1422.22, 1);
  });

  it('falls back to the box size when the natural size is degenerate', () => {
    expect(fitBox({ width: 0, height: 0 }, { width: 200, height: 100 }, 'contain')).toEqual({
      width: 200,
      height: 100,
    });
  });
});

describe('palette', () => {
  it('describes a colour as hex, rgb and hsl', () => {
    const white = describeColor(255, 255, 255);
    expect(white.hex).toBe('#ffffff');
    expect(white.hsl).toEqual({ h: 0, s: 0, l: 100 });

    const red = describeColor(255, 0, 0);
    expect(red.hex).toBe('#ff0000');
    expect(red.hsl).toEqual({ h: 0, s: 100, l: 50 });
  });

  it('quantises a synthetic pixel buffer into the dominant colours by share', () => {
    // 4 red, 2 green, 2 blue pixels, RGBA. Red is exactly half the pixels, so median cut
    // separates it cleanly on the first split; green and blue split cleanly on the second.
    const pixels = new Uint8ClampedArray([
      ...Array(4).fill([255, 0, 0, 255]).flat(),
      ...Array(2).fill([0, 255, 0, 255]).flat(),
      ...Array(2).fill([0, 0, 255, 255]).flat(),
    ]);

    const palette = quantizePixels(pixels, 3);

    expect(palette).toHaveLength(3);
    expect(palette[0]!.hex).toBe('#ff0000');
    expect(palette[0]!.share).toBeCloseTo(0.5);

    const rest = palette.slice(1).map((color) => color.hex).sort();
    expect(rest).toEqual(['#00ff00', '#0000ff'].sort());
    for (const color of palette.slice(1)) expect(color.share).toBeCloseTo(0.25);
  });

  it('ignores near transparent pixels when quantising', () => {
    const pixels = new Uint8ClampedArray([
      ...[255, 0, 0, 255],
      ...[0, 255, 0, 0], // fully transparent, should be skipped
    ]);

    const palette = quantizePixels(pixels, 2);
    expect(palette).toHaveLength(1);
    expect(palette[0]!.hex).toBe('#ff0000');
  });

  it('returns an empty palette when every pixel is transparent', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 0]);
    expect(quantizePixels(pixels, 3)).toEqual([]);
  });
});
