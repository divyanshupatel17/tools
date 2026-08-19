import { cn } from '@/lib/utils/cn';

type Tone = 'neutral' | 'brand' | 'success';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-muted',
  brand: 'bg-brand text-on-brand',
  success: 'bg-success/15 text-success',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
