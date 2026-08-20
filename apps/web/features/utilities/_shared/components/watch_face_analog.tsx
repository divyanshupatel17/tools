import { cn } from '@/lib/utils/cn';

const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TICKS = Array.from({ length: 60 }, (_, index) => index);

interface WatchFaceAnalogProps {
  /** Stopwatch sweeps a hand continuously; timer depletes a ring around the remaining time. */
  variant: 'stopwatch' | 'timer';
  /** Stopwatch: hand angle in degrees, 0 at 12 o'clock. */
  sweepDeg?: number;
  /** Timer: fraction of the duration remaining, 1 at the start, 0 at zero. */
  remainingFraction?: number;
  centerValue?: string;
  centerLabel?: string;
  className?: string;
}

/**
 * The dial shared by both tools' analog face, themed entirely via `--w-*` CSS vars. Every
 * themed colour is set through the `style` prop rather than a bare `stroke="var(--w-x)"`
 * attribute — SVG presentation attributes don't reliably resolve `var()` the way CSS
 * properties do, and silently fall back to the SVG spec's initial value (black) when they
 * don't, which is invisible in testing against a theme that happens to use dark accents.
 */
export function WatchFaceAnalog({
  variant,
  sweepDeg = 0,
  remainingFraction = 1,
  centerValue,
  centerLabel,
  className,
}: WatchFaceAnalogProps) {
  const dashOffset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, remainingFraction)));

  return (
    <div
      // `cqw` sizes the centre readout relative to this dial's own width rather than the
      // viewport's — the dial is much narrower on the normal page than in fullscreen, and a
      // vw-based size tuned for one overflowed the other.
      style={{ borderRadius: '50%', containerType: 'inline-size' }}
      className={cn('watch-face relative flex aspect-square w-full max-w-2xl items-center justify-center', className)}
    >
      <svg viewBox="0 0 200 200" className="h-[86%] w-[86%]" aria-hidden>
        {TICKS.map((tick) => {
          const major = tick % 5 === 0;
          const angle = (tick / 60) * 360;
          return (
            <line
              key={tick}
              x1={100}
              y1={major ? 12 : 16}
              x2={100}
              y2={major ? 22 : 20}
              style={{ stroke: 'var(--w-muted)' }}
              strokeWidth={major ? 2.5 : 1.2}
              opacity={major ? 0.7 : 0.35}
              transform={`rotate(${angle} 100 100)`}
            />
          );
        })}

        {variant === 'timer' && (
          <>
            <circle
              cx={100}
              cy={100}
              r={RADIUS}
              fill="none"
              style={{ stroke: 'var(--w-border)' }}
              strokeWidth={6}
              opacity={0.35}
            />
            <circle
              cx={100}
              cy={100}
              r={RADIUS}
              fill="none"
              style={{ stroke: 'var(--w-accent)' }}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 100 100)"
              className="transition-[stroke-dashoffset] duration-300 ease-linear"
            />
          </>
        )}

        {variant === 'stopwatch' && (
          <line
            x1={100}
            y1={100}
            x2={100}
            y2={34}
            style={{ stroke: 'var(--w-accent)' }}
            strokeWidth={4}
            strokeLinecap="round"
            transform={`rotate(${sweepDeg} 100 100)`}
          />
        )}

        <circle cx={100} cy={100} r={5} style={{ fill: 'var(--w-accent)' }} />
      </svg>

      {(centerValue || centerLabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          {centerValue && (
            <p
              style={{ fontSize: 'clamp(1.25rem, 11cqw, 3.5rem)' }}
              className="watch-readout px-[8%] font-mono text-3xl font-bold tabular-nums"
            >
              {centerValue}
            </p>
          )}
          {centerLabel && <p className="text-[var(--w-muted)] text-xs">{centerLabel}</p>}
        </div>
      )}
    </div>
  );
}
