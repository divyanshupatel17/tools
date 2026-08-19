import { assetPath } from '@/lib/utils/asset_path';

interface ArtProps {
  /** Path under `public/`, e.g. `/images/mascot-girl.webp`. */
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
}

/**
 * Illustrations are pre-sized at build time, so they skip next/image entirely:
 * one plain request per asset, no optimiser round-trip under `basePath`.
 */
export function Art({ src, alt = '', width, height, className, style, priority }: ArtProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={assetPath(src)}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={style}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      {...(alt === '' ? { 'aria-hidden': true } : {})}
    />
  );
}
