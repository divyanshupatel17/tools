import { Art } from './art';

export type DoodleName =
  | 'star'
  | 'star-filled'
  | 'sparkle'
  | 'sun'
  | 'swirl'
  | 'sprig'
  | 'paper-plane'
  | 'arrow-curve'
  | 'arrow-flick'
  | 'rocket'
  | 'cloud';

/**
 * Decorative hand-drawn marks. The ink colour is baked into the file, so dark mode
 * lifts them with a filter instead of shipping a second copy of every doodle.
 */
export function Doodle({ name, className }: { name: DoodleName; className?: string }) {
  return (
    <Art
      src={`/doodles/${name}.svg`}
      width={100}
      height={100}
      className={`pointer-events-none select-none dark:brightness-125 dark:saturate-75 ${className ?? ''}`}
    />
  );
}
