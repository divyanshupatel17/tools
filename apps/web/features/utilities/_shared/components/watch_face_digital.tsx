import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface WatchFaceDigitalProps {
  value: string;
  label?: ReactNode;
  caption?: ReactNode;
  className?: string;
}

// `cqw` sizes relative to this wrapper's own width rather than the viewport's — the readout
// sits in a narrow card on the normal page but a near-full-width block in fullscreen, and a
// vw-based size tuned for one overflowed the other. Browsers without container query support
// (very old only) ignore the invalid cqw value entirely and fall back to the `text-6xl` class.
const containerStyle: CSSProperties = { containerType: 'inline-size' };
const readoutStyle: CSSProperties = { color: 'var(--w-text)', fontSize: 'clamp(2rem, 13cqw, 11rem)', lineHeight: 1.05 };

/**
 * The big numeral readout shared by both tools' digital face. No card, no per-digit box — the
 * numerals sit directly on the theme's own page background and carry the theme through colour
 * and `--w-glow`'s text-shadow recipe (claymorphism's soft puff, neo-brutalism's hard offset,
 * cyberpunk/terminal's neon, skeuomorphism's engraved bevel, etc.) rather than a box around
 * them. Sized to dominate its container rather than compete with the surrounding controls.
 */
export function WatchFaceDigital({ value, label, caption, className }: WatchFaceDigitalProps) {
  return (
    <div
      style={containerStyle}
      className={cn('flex w-full flex-col items-center justify-center gap-3 text-center', className)}
    >
      {label && <p className="text-[var(--w-muted)] text-xs font-semibold tracking-[0.2em] uppercase">{label}</p>}
      <p
        style={readoutStyle}
        className="watch-readout w-full text-6xl font-mono font-bold tabular-nums whitespace-nowrap"
      >
        {value}
      </p>
      {caption && <p className="text-[var(--w-muted)] text-base">{caption}</p>}
    </div>
  );
}
