import { describe, expect, it } from 'vitest';
import { containRect } from '@/lib/video/crop_drag';
import { buildExportArgs, MAX_GIF_SECONDS } from '@/features/video/screen_recorder/processor';
import {
  bubbleRect,
  cornerPosition,
  coverSourceRect,
  DEFAULT_BUBBLE,
  formatElapsed,
  pickSupportedMimeType,
  qualityById,
  QUALITY_PRESETS,
  RECORDING_PRESETS,
} from '@/features/video/screen_recorder/recorder';

describe('cornerPosition', () => {
  it('anchors each corner with a small margin, accounting for bubble size', () => {
    const br = cornerPosition('bottom-right', 0.2);
    expect(br.x).toBeCloseTo(1 - 0.2 - 0.03);
    expect(br.y).toBeCloseTo(1 - 0.2 - 0.03);

    const tl = cornerPosition('top-left', 0.2);
    expect(tl.x).toBeCloseTo(0.03);
    expect(tl.y).toBeCloseTo(0.03);
  });

  it('never goes negative for a bubble too large to leave a margin', () => {
    const corner = cornerPosition('top-left', 0.99);
    expect(corner.x).toBeGreaterThanOrEqual(0);
    expect(corner.y).toBeGreaterThanOrEqual(0);
  });
});

describe('bubbleRect', () => {
  it('sizes the bubble from the shorter canvas side', () => {
    const rect = bubbleRect(1920, 1080, { ...DEFAULT_BUBBLE, x: 0, y: 0, sizeRatio: 0.2 });
    expect(rect.width).toBe(Math.round(1080 * 0.2));
    expect(rect.height).toBe(rect.width);
  });

  it('clamps position so the bubble never drags off the edge', () => {
    const rect = bubbleRect(1000, 1000, { ...DEFAULT_BUBBLE, x: 1.5, y: -1, sizeRatio: 0.2 });
    expect(rect.left).toBeLessThanOrEqual(1000 - rect.width);
    expect(rect.top).toBeGreaterThanOrEqual(0);
  });

  it('agrees with the overlay diameter/position math (via containRect) when the preview box is letterboxed', () => {
    // A 16:9 canvas (1920x1080) inside a preview box a max-height cap pinched to something
    // taller than 16:9 — bubble_overlay.tsx must draw its drag handle at the same spot
    // bubbleRect draws the actual composited bubble, scaled through the same letterboxed rect.
    const natural = { width: 1920, height: 1080 };
    const container = { width: 700, height: 500 }; // not 16:9
    const displayRect = containRect(container, natural);
    const bubble = { ...DEFAULT_BUBBLE, x: 0.1, y: 0.2, sizeRatio: 0.2 };

    const naturalBubble = bubbleRect(natural.width, natural.height, bubble);
    const scale = displayRect.width / natural.width;

    // The overlay's own formula from bubble_overlay.tsx.
    const overlayDiameter = bubble.sizeRatio * Math.min(displayRect.width, displayRect.height);
    const overlayLeft = displayRect.left + bubble.x * displayRect.width;
    const overlayTop = displayRect.top + bubble.y * displayRect.height;

    expect(overlayDiameter).toBeCloseTo(naturalBubble.width * scale);
    expect(overlayLeft).toBeCloseTo(displayRect.left + naturalBubble.left * scale);
    expect(overlayTop).toBeCloseTo(displayRect.top + naturalBubble.top * scale);
  });
});

describe('coverSourceRect', () => {
  it('crops a wider source to match a narrower target, centered horizontally', () => {
    const { sx, sy, sw, sh } = coverSourceRect(1920, 1080, { width: 100, height: 100 });
    expect(sw).toBe(sh); // a square crop out of a 16:9 source
    expect(sx).toBeGreaterThan(0);
    expect(sy).toBe(0);
  });

  it('crops a taller source to match a wider target, centered vertically', () => {
    const { sx, sy, sw, sh } = coverSourceRect(1080, 1920, { width: 200, height: 100 });
    expect(sw).toBe(1080);
    expect(sh).toBeLessThan(1920);
    expect(sx).toBe(0);
    expect(sy).toBeGreaterThan(0);
  });
});

describe('pickSupportedMimeType', () => {
  it('returns the first candidate the browser reports as supported', () => {
    const result = pickSupportedMimeType(['a', 'b', 'c'], (type) => type === 'b');
    expect(result).toBe('b');
  });

  it('returns null when nothing is supported', () => {
    expect(pickSupportedMimeType(['a', 'b'], () => false)).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('formats under an hour as mm:ss', () => {
    expect(formatElapsed(65)).toBe('01:05');
  });

  it('formats an hour or more with an hours segment', () => {
    expect(formatElapsed(3661)).toBe('1:01:01');
  });
});

describe('qualityById', () => {
  it('finds the matching preset', () => {
    expect(qualityById('720p30')).toEqual(QUALITY_PRESETS[0]);
  });

  it('falls back to a sane default for an unknown id', () => {
    expect(qualityById('nonexistent')).toEqual(QUALITY_PRESETS[1]);
  });
});

describe('RECORDING_PRESETS', () => {
  it('every preset resolves to a real quality preset', () => {
    for (const preset of RECORDING_PRESETS) {
      expect(QUALITY_PRESETS.some((q) => q.id === preset.quality_id)).toBe(true);
    }
  });
});

describe('buildExportArgs', () => {
  it('trims with -ss/-to before -i for a webm export', () => {
    const args = buildExportArgs({ start: 1, end: 4, format: 'webm' }, 'in.webm', 'out.webm');
    expect(args.slice(0, 5)).toEqual(['-ss', '1.000', '-to', '4.000', '-i']);
    expect(args).toContain('libvpx');
    expect(args).toContain('libopus');
  });

  it('uses h264/aac for mp4 and mov', () => {
    const mp4 = buildExportArgs({ start: 0, end: 2, format: 'mp4' }, 'in.webm', 'out.mp4');
    expect(mp4).toContain('libx264');
    expect(mp4).toContain('aac');
    const mov = buildExportArgs({ start: 0, end: 2, format: 'mov' }, 'in.webm', 'out.mov');
    expect(mov).toContain('libx264');
  });

  it('caps a GIF export at MAX_GIF_SECONDS regardless of the selected range', () => {
    const args = buildExportArgs({ start: 0, end: 999, format: 'gif' }, 'in.webm', 'out.gif');
    expect(args[1]).toBe('0.000');
    expect(Number(args[3])).toBeCloseTo(MAX_GIF_SECONDS);
    expect(args).toContain('-an');
    const filter = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(filter).toContain('palettegen');
  });

  it('never lets the trimmed range collapse to zero length', () => {
    const args = buildExportArgs({ start: 3, end: 3, format: 'webm' }, 'in.webm', 'out.webm');
    expect(Number(args[3])).toBeGreaterThan(Number(args[1]));
  });
});
