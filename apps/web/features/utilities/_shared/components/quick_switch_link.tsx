import Link from 'next/link';
import { ArrowLeftRight } from 'lucide-react';
import { markReenterFullscreen } from './use_resume_fullscreen';

interface QuickSwitchLinkProps {
  href: string;
  label: string;
  isFullscreen: boolean;
}

/**
 * Small link in the action bar that swaps directly between Stopwatch and Timer. If the current
 * tool is fullscreen, marks that the destination should resume fullscreen once it mounts —
 * the DOM node driving fullscreen is unmounted on navigation either way, so it always exits
 * first; this is what brings it back.
 */
export function QuickSwitchLink({ href, label, isFullscreen }: QuickSwitchLinkProps) {
  return (
    <Link
      href={href}
      onClick={() => {
        if (isFullscreen) markReenterFullscreen();
      }}
      title={label}
      aria-label={label}
      className="watch-button flex size-10 shrink-0 items-center justify-center rounded-full"
    >
      <ArrowLeftRight aria-hidden className="size-4" />
    </Link>
  );
}
