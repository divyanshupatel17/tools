import { describe, expect, it } from 'vitest';
import { applyCropDrag } from '@/lib/video/crop_drag';

const NATURAL = { width: 1280, height: 720 };
const FULL_FRAME = { x: 0, y: 0, width: 1280, height: 720 };

describe('applyCropDrag', () => {
  it('grows the box from the east handle without moving its origin', () => {
    // Start from a smaller box so there is room to grow within the frame.
    const box = { x: 0, y: 0, width: 800, height: 720 };
    const next = applyCropDrag('e', box, 200, 0, NATURAL);
    expect(next).toEqual({ x: 0, y: 0, width: 1000, height: 720 });
  });

  it('shrinks the box from the south east corner, keeping the top left fixed', () => {
    const next = applyCropDrag('se', FULL_FRAME, -281, -187, NATURAL);
    expect(next).toEqual({ x: 0, y: 0, width: 999, height: 533 });
  });

  it('moves both x and y from the west handle without changing height', () => {
    const box = { x: 200, y: 0, width: 800, height: 720 };
    const next = applyCropDrag('w', box, -100, 0, NATURAL);
    expect(next).toEqual({ x: 100, y: 0, width: 900, height: 720 });
  });

  it('never lets the east edge push width past the natural frame', () => {
    const box = { x: 100, y: 0, width: 1000, height: 720 };
    const next = applyCropDrag('e', box, 500, 0, NATURAL);
    expect(next.width).toBe(1180); // natural.width - x
  });

  it('never shrinks a side below the minimum crop size', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    const next = applyCropDrag('e', box, -1000, 0, NATURAL);
    expect(next.width).toBe(16);
  });

  it('translates the whole box on move without resizing it', () => {
    const box = { x: 100, y: 100, width: 400, height: 300 };
    const next = applyCropDrag('move', box, 50, -30, NATURAL);
    expect(next).toEqual({ x: 150, y: 70, width: 400, height: 300 });
  });

  it('clamps a move so the box never leaves the frame', () => {
    const box = { x: 0, y: 0, width: 400, height: 300 };
    const next = applyCropDrag('move', box, -50, -50, NATURAL);
    expect(next).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });
});
