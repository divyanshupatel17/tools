'use client';

import { cn } from '@/lib/utils/cn';

export interface ShapeOption {
  id: string;
  label: string;
  /** Corner radius as a fraction of the swatch size; 0.5 reads as a circle. */
  radius: number;
  diamond?: boolean;
  /** A smaller square inset from the swatch edge, for the gapped/mosaic look. */
  inset?: number;
  /** Which corners the radius applies to, [tl, tr, br, bl] — defaults to all four. */
  corners?: [boolean, boolean, boolean, boolean];
}

export const BODY_SHAPE_OPTIONS: ShapeOption[] = [
  { id: 'square', label: 'Square', radius: 0 },
  { id: 'dots', label: 'Dots', radius: 0.5 },
  { id: 'rounded', label: 'Rounded', radius: 0.32 },
  { id: 'extra-rounded', label: 'Extra rounded', radius: 0.5 },
  { id: 'diamond', label: 'Diamond', radius: 0, diamond: true },
  { id: 'gapped-square', label: 'Gapped', radius: 0, inset: 0.14 },
  { id: 'classy', label: 'Classy', radius: 0.5, corners: [true, false, true, false] },
  { id: 'classy-rounded', label: 'Classy rounded', radius: 0.5, corners: [true, false, true, false] },
];

export const EYE_SHAPE_OPTIONS: ShapeOption[] = [
  { id: 'square', label: 'Square', radius: 0 },
  { id: 'rounded', label: 'Rounded', radius: 0.28 },
  { id: 'circle', label: 'Circle', radius: 0.5 },
  { id: 'leaf', label: 'Leaf', radius: 0.5, corners: [true, false, true, false] },
  { id: 'leaf-alt', label: 'Leaf alt', radius: 0.5, corners: [false, true, false, true] },
  { id: 'shield', label: 'Shield', radius: 0.45, corners: [true, true, false, false] },
];

function swatchPath(size: number, option: ShapeOption): string {
  if (option.diamond) {
    return `M${size / 2},0 L${size},${size / 2} L${size / 2},${size} L0,${size / 2} Z`;
  }
  if (option.inset) {
    const pad = size * option.inset;
    return `M${pad},${pad} L${size - pad},${pad} L${size - pad},${size - pad} L${pad},${size - pad} Z`;
  }
  const r = size * option.radius;
  const [tlOn, trOn, brOn, blOn] = option.corners ?? [true, true, true, true];
  const tl = tlOn ? r : 0;
  const tr = trOn ? r : 0;
  const br = brOn ? r : 0;
  const bl = blOn ? r : 0;
  return [
    `M${tl},0`,
    `L${size - tr},0`,
    tr > 0 ? `A${tr},${tr} 0 0 1 ${size},${tr}` : '',
    `L${size},${size - br}`,
    br > 0 ? `A${br},${br} 0 0 1 ${size - br},${size}` : '',
    `L${bl},${size}`,
    bl > 0 ? `A${bl},${bl} 0 0 1 0,${size - bl}` : '',
    `L0,${tl}`,
    tl > 0 ? `A${tl},${tl} 0 0 1 ${tl},0` : '',
    'Z',
  ]
    .filter(Boolean)
    .join(' ');
}

export function ShapeSwatch({
  option,
  active,
  onClick,
}: {
  option: ShapeOption;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={option.label}
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors',
        active ? 'border-brand bg-brand/10' : 'border-border hover:bg-surface-muted',
      )}
    >
      <svg viewBox="0 0 24 24" className="text-foreground size-6">
        <path d={swatchPath(24, option)} fill="currentColor" />
      </svg>
      <span className="text-muted text-[10px] leading-none">{option.label}</span>
    </button>
  );
}
