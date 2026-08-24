'use client';

import { useSyncExternalStore } from 'react';

export type DoodleMarkName =
  | 'star'
  | 'star-filled'
  | 'sparkle'
  | 'sun'
  | 'swirl'
  | 'sprig'
  | 'paper-plane'
  | 'rocket'
  | 'cloud'
  | 'arrow-flick';

export interface DoodleMark {
  id: number;
  name: DoodleMarkName;
  slot: string;
  size: string;
  flip: boolean;
  tilt: string;
  visible: boolean;
}

const NAMES: DoodleMarkName[] = [
  'star',
  'star-filled',
  'sparkle',
  'sun',
  'swirl',
  'sprig',
  'paper-plane',
  'rocket',
  'cloud',
  'arrow-flick',
];

/** Anchors down both gutters. Nothing is placed over the centre column of copy. */
const SLOTS = [
  'left-[3%] top-[6%]',
  'left-[9%] top-[3%]',
  'left-[15%] top-[8%]',
  'left-[20%] top-[14%]',
  'left-[4%] top-[18%]',
  'left-[11%] top-[22%]',
  'left-[17%] top-[29%]',
  'left-[6%] top-[34%]',
  'left-[13%] top-[41%]',
  'left-[20%] top-[46%]',
  'left-[3%] top-[52%]',
  'left-[10%] top-[58%]',
  'left-[17%] top-[64%]',
  'left-[6%] top-[71%]',
  'left-[14%] top-[78%]',
  'left-[21%] top-[85%]',
  'right-[3%] top-[5%]',
  'right-[9%] top-[3%]',
  'right-[15%] top-[9%]',
  'right-[20%] top-[15%]',
  'right-[4%] top-[19%]',
  'right-[11%] top-[24%]',
  'right-[17%] top-[30%]',
  'right-[5%] top-[36%]',
  'right-[13%] top-[42%]',
  'right-[20%] top-[48%]',
  'right-[3%] top-[54%]',
  'right-[10%] top-[60%]',
  'right-[17%] top-[66%]',
  'right-[6%] top-[73%]',
  'right-[14%] top-[80%]',
  'right-[21%] top-[86%]',
];

export type DoodleScale = 'normal' | 'large';
/** `gutters` uses both margins; `right` keeps clear of a left-aligned column of copy. */
export type DoodleRegion = 'gutters' | 'right';

export interface DoodleFieldOptions {
  scale?: DoodleScale;
  region?: DoodleRegion;
}

const SIZE_POOLS: Record<DoodleScale, string[]> = {
  normal: ['w-4', 'w-5', 'w-6', 'w-7', 'w-8', 'w-10', 'w-12', 'w-14'],
  large: ['w-8', 'w-10', 'w-12', 'w-14', 'w-16', 'w-20', 'w-24'],
};

const TILTS = ['rotate-0', 'rotate-6', '-rotate-6', 'rotate-12', '-rotate-12'];

const COUNTS: Record<DoodleScale, number> = { normal: 18, large: 22 };

let sizes = SIZE_POOLS.normal;
let slots = SLOTS;
let visibleCount = COUNTS.normal;
/** One mark turns over at a time; the fade is long enough to never read as a pop. */
const SWAP_EVERY = 2600;
const FADE_MS = 1800;

const EMPTY: DoodleMark[] = [];

let marks: DoodleMark[] = EMPTY;
let counter = 0;
let readers = 0;
let swapTimer = 0;
let replaceTimer = 0;
let revealFrame = 0;

const listeners = new Set<() => void>();

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

function emit(next: DoodleMark[]) {
  marks = next;
  for (const listener of listeners) listener();
}

/** New marks mount hidden; a frame later they are flipped on so the CSS transition runs. */
function makeMark(slot: string): DoodleMark {
  counter += 1;
  return {
    id: counter,
    name: pick(NAMES),
    slot,
    size: pick(sizes),
    flip: Math.random() > 0.5,
    tilt: pick(TILTS),
    visible: false,
  };
}

/** Two frames, not one: the browser must paint the hidden state before flipping the class,
 * or it coalesces both values and the mark appears with no transition. */
function revealAll() {
  window.cancelAnimationFrame(revealFrame);
  revealFrame = window.requestAnimationFrame(() => {
    revealFrame = window.requestAnimationFrame(() => {
      emit(marks.map((mark) => (mark.visible ? mark : { ...mark, visible: true })));
    });
  });
}

function swapOne() {
  if (marks.length === 0) return;
  const target = Math.floor(Math.random() * marks.length);
  const leavingId = marks[target]!.id;

  emit(marks.map((mark) => (mark.id === leavingId ? { ...mark, visible: false } : mark)));

  window.clearTimeout(replaceTimer);
  replaceTimer = window.setTimeout(() => {
    const taken = new Set(marks.map((mark) => mark.slot));
    const free = slots.filter((slot) => !taken.has(slot));
    const index = marks.findIndex((mark) => mark.id === leavingId);
    if (index === -1) return;

    emit(
      marks.map((mark, position) =>
        position === index ? makeMark(free.length > 0 ? pick(free) : mark.slot) : mark,
      ),
    );
    revealAll();
  }, FADE_MS);
}

/** Kept in a module store so the scatter is decided client side and never baked into the HTML. */
export function startDoodleField(options: DoodleFieldOptions = {}): () => void {
  readers += 1;

  if (readers === 1) {
    const scale = options.scale ?? 'normal';
    sizes = SIZE_POOLS[scale];
    slots = options.region === 'right' ? SLOTS.filter((slot) => slot.startsWith('right-')) : SLOTS;
    visibleCount = Math.min(COUNTS[scale], slots.length);
    const shuffled = [...slots].sort(() => Math.random() - 0.5);
    emit(shuffled.slice(0, visibleCount).map(makeMark));
    revealAll();

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      swapTimer = window.setInterval(swapOne, SWAP_EVERY);
    }
  }

  return () => {
    readers -= 1;
    if (readers > 0) return;
    window.clearInterval(swapTimer);
    window.clearTimeout(replaceTimer);
    window.cancelAnimationFrame(revealFrame);
  };
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function useDoodleMarks(): DoodleMark[] {
  return useSyncExternalStore(
    subscribe,
    () => marks,
    () => EMPTY,
  );
}
