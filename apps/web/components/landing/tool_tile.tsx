'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ToolIcon } from '@/components/ui/tool_icon';
import { accentStyle, toolAccent } from '@/lib/tools/accents';
import { toolPath } from '@/lib/tools/registry';
import type { Tool } from '@/lib/tools/tool_types';

/** Long enough that scanning a grid never sets off a trail of tooltips. */
const HOVER_DELAY = 600;

/**
 * A name-only tile. The description is the one thing a listing of forty tools cannot
 * afford to show at rest, so it waits behind a deliberate hover — and is always in the
 * accessibility tree for anyone not using a mouse.
 */
export function ToolTile({ tool }: { tool: Tool }) {
  const [hint, setHint] = useState<'left' | 'right' | null>(null);
  const timer = useRef(0);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function open() {
    // Touch devices fire a synthetic hover on tap; a tooltip there just covers the next tile.
    if (!window.matchMedia('(hover: hover)').matches) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const box = anchor.current?.getBoundingClientRect();
      // Anchor to whichever edge keeps the panel inside the viewport.
      setHint(box && box.left + box.width / 2 > window.innerWidth / 2 ? 'right' : 'left');
    }, HOVER_DELAY);
  }

  function close() {
    window.clearTimeout(timer.current);
    setHint(null);
  }

  return (
    <div ref={anchor} className="relative" onPointerEnter={open} onPointerLeave={close}>
      <Link
        href={toolPath(tool)}
        onFocus={close}
        className="border-border bg-surface hover:border-brand hover:shadow-card flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 transition-colors sm:px-3"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg"
          style={accentStyle(toolAccent(tool))}
        >
          <ToolIcon name={tool.icon} className="size-[18px]" />
        </span>

        {/* Wraps rather than truncates: the name is the only thing identifying the tool. */}
        <span className="line-clamp-2 min-w-0 flex-1 text-[13.5px] leading-tight font-bold">
          {tool.name}
        </span>

        {/* Almost every tool is planned today, so the marker stays quiet: a chip, not a line. */}
        {tool.status === 'planned' && (
          <span className="bg-surface-muted text-muted shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
            Soon
          </span>
        )}

        {/* The description still reaches screen readers, which never get the hover. */}
        <span className="sr-only">{tool.description}</span>
      </Link>

      {hint && (
        <div
          aria-hidden
          data-hint
          className={`bg-ink text-paper absolute top-full z-40 mt-1.5 w-max max-w-[min(20rem,72vw)] rounded-lg px-3 py-2 text-[12.5px] leading-snug shadow-lg ${
            hint === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {tool.description}
        </div>
      )}
    </div>
  );
}
