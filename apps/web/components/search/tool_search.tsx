'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Search, SearchX } from 'lucide-react';
import { ToolIcon } from '@/components/ui/tool_icon';
import { accentStyle, toolAccent } from '@/lib/tools/accents';
import { searchTools, toolPath } from '@/lib/tools/registry';

export const HERO_SEARCH_ID = 'tool-search';

type Phase = 'idle' | 'searching' | 'found' | 'empty';

const PHASE_ICON = {
  idle: Search,
  searching: Loader2,
  found: Check,
  empty: SearchX,
} as const;

export function ToolSearch({
  placeholder = 'Search a tool (e.g. merge PDF, compress image, mp4 to mp3)',
  autoFocus = false,
  onNavigate,
}: {
  placeholder?: string;
  autoFocus?: boolean;
  /** Called when a result is clicked, so an overlay caller can close itself. */
  onNavigate?: () => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const debounce = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const trimmed = query.trim();
  const results = useMemo(() => searchTools(applied), [applied]);

  useEffect(() => () => window.clearTimeout(debounce.current), []);

  // A short beat before the results land, so the button reads as doing the work.
  function onChange(value: string) {
    setQuery(value);
    window.clearTimeout(debounce.current);

    if (value.trim().length === 0) {
      setApplied('');
      return;
    }
    debounce.current = window.setTimeout(() => setApplied(value), 260);
  }

  const settled = applied.trim() === trimmed;
  const phase: Phase =
    trimmed.length === 0 ? 'idle' : !settled ? 'searching' : results.length > 0 ? 'found' : 'empty';

  const open = trimmed.length > 0 && settled;
  const Icon = PHASE_ICON[phase];

  return (
    <div className="relative z-30 w-full">
      <label htmlFor={HERO_SEARCH_ID} className="sr-only">
        Search tools
      </label>

      <div className="border-border bg-surface shadow-card flex h-14 items-center gap-3 rounded-full border pr-2 pl-5 sm:h-[60px] sm:pl-7">
        <input
          id={HERO_SEARCH_ID}
          ref={inputRef}
          type="text"
          role="combobox"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          aria-controls={listId}
          aria-expanded={open && results.length > 0}
          className="placeholder:text-muted h-full w-full min-w-0 bg-transparent text-[15px] outline-none sm:text-base"
        />
        <span
          aria-hidden
          className="bg-brand text-ink flex size-10 shrink-0 items-center justify-center rounded-full transition-colors sm:size-11"
        >
          <Icon className={`size-5 ${phase === 'searching' ? 'animate-spin' : ''}`} />
        </span>
      </div>

      <p aria-live="polite" className="sr-only">
        {phase === 'searching' && 'Searching'}
        {phase === 'found' && `${results.length} tools found`}
        {phase === 'empty' && 'No tools found'}
      </p>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="border-border bg-surface shadow-card absolute inset-x-0 top-full mt-2 overflow-hidden rounded-3xl border text-left"
        >
          {results.length === 0 ? (
            <p className="text-muted px-6 py-4 text-sm">No tool matches “{trimmed}”.</p>
          ) : (
            <ul className="max-h-[46vh] overflow-y-auto overscroll-contain py-1">
              {results.map((tool) => (
                <li key={`${tool.category}/${tool.slug}`}>
                  <Link
                    href={toolPath(tool)}
                    role="option"
                    aria-selected={false}
                    onClick={onNavigate}
                    className="hover:bg-cream flex items-center gap-3 px-5 py-2.5"
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                      style={accentStyle(toolAccent(tool))}
                    >
                      <ToolIcon name={tool.icon} className="size-[18px]" />
                    </span>
                    <span className="truncate text-sm font-semibold">{tool.name}</span>
                    <span className="text-muted ml-auto shrink-0 text-xs capitalize">
                      {tool.category}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
