'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { NumberedTextarea } from '@/components/text/numbered_textarea';
import { TextToolbar } from '@/components/text/text_toolbar';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import {
  markDuplicates,
  summarizeDuplicates,
  type DuplicateOptions,
  type KeepOccurrence,
  type MatchType,
} from '@/lib/text/duplicate_lines';
import { cn } from '@/lib/utils/cn';

const PLACEHOLDER = 'Paste or type your text here, one item per line…';
type ViewMode = 'highlight' | 'remove';

function OptionRadioRow({
  name,
  label,
  description,
  checked,
  onSelect,
}: {
  name: string;
  label: string;
  description: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="accent-brand mt-0.5 size-4"
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="text-muted block text-xs">{description}</span>
      </span>
    </label>
  );
}

export function DuplicateLinesWorkspace() {
  const [text, setText] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('highlight');
  const [matchType, setMatchType] = useState<MatchType>('exact');
  const [keepOccurrence, setKeepOccurrence] = useState<KeepOccurrence>('first');
  const [ignoreSpaces, setIgnoreSpaces] = useState(false);
  const [ignoreEmptyLines, setIgnoreEmptyLines] = useState(false);
  const [highlightDuplicates, setHighlightDuplicates] = useState(true);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const options: DuplicateOptions = {
    match_type: matchType,
    keep_occurrence: keepOccurrence,
    ignore_spaces: ignoreSpaces,
    ignore_empty_lines: ignoreEmptyLines,
  };

  const marked = useMemo(
    () => markDuplicates(text, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, matchType, keepOccurrence, ignoreSpaces, ignoreEmptyLines],
  );
  const summary = summarizeDuplicates(marked);
  const uniqueLines = useMemo(
    () => marked.filter((line) => !line.isDuplicate).map((line) => line.text),
    [marked],
  );

  const inputLines = text === '' ? 0 : text.split('\n').length;

  const outputToggle = (
    <div className="border-border flex rounded-full border p-0.5 text-xs">
      <button
        type="button"
        onClick={() => setViewMode('highlight')}
        aria-pressed={viewMode === 'highlight'}
        className={cn(
          'rounded-full px-2.5 py-1 font-medium transition-colors',
          viewMode === 'highlight' ? 'bg-brand text-on-brand' : 'text-muted hover:text-foreground',
        )}
      >
        Highlight Duplicates
      </button>
      <button
        type="button"
        onClick={() => setViewMode('remove')}
        aria-pressed={viewMode === 'remove'}
        className={cn(
          'rounded-full px-2.5 py-1 font-medium transition-colors',
          viewMode === 'remove' ? 'bg-brand text-on-brand' : 'text-muted hover:text-foreground',
        )}
      >
        Remove Duplicates
      </button>
    </div>
  );

  const outputBody = (
    <>
      {viewMode === 'highlight' ? (
        <div className="border-border bg-background min-h-[45vh] overflow-y-auto rounded-2xl border">
          {marked.length === 0 ? (
            <p className="text-muted p-4 text-sm">Your output will appear here.</p>
          ) : (
            <ul>
              {marked.map((line, index) => (
                <li
                  key={index}
                  className={cn(
                    'flex items-center gap-3 px-3 py-1.5 font-mono text-sm leading-6',
                    highlightDuplicates && line.isDuplicate && 'bg-brand/15',
                  )}
                >
                  <span className="text-muted w-6 shrink-0 text-right text-xs">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{line.text}</span>
                  {highlightDuplicates &&
                    (line.isDuplicate ? (
                      <span
                        aria-hidden
                        className="bg-brand size-2 shrink-0 rounded-full"
                        title="Duplicate line"
                      />
                    ) : (
                      <span aria-hidden className="text-muted shrink-0 text-xs">
                        —
                      </span>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <NumberedTextarea
          value={uniqueLines.join('\n')}
          readOnly
          placeholder="Your output will appear here."
        />
      )}

      <p className="text-muted mt-2 flex items-center gap-3 text-xs">
        {viewMode === 'highlight' ? (
          <>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="bg-brand size-2 rounded-full" />
              {summary.duplicateLines} duplicate lines
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden>—</span>
              {summary.uniqueLines} unique lines
            </span>
          </>
        ) : (
          `${uniqueLines.length} lines`
        )}
      </p>
      {notice && <p className="text-danger mt-1 text-xs">{notice}</p>}
    </>
  );

  const outputPanel = (
    <>
      <div className="mb-2 flex justify-end">{outputToggle}</div>
      {outputBody}
    </>
  );

  async function copyResult() {
    const value = viewMode === 'remove' ? uniqueLines.join('\n') : marked.map((l) => l.text).join('\n');
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadResult() {
    setNotice(null);
    try {
      const processor = await loadProcessor('text.duplicate-lines');
      const output = await processor(
        { files: [], text, options: { ...options } },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That file could not be created.');
    }
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <TextToolbar
          value={text}
          onChange={setText}
          placeholder={PLACEHOLDER}
          autosaveKey="duplicate-lines"
          inputLabel="Input Text"
          expandedOutput={outputPanel}
          expandedOutputLabel="Output"
        />

        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Input Text</p>
              <p className="text-muted text-xs">
                {inputLines} lines · {text.length} characters
              </p>
            </div>
            <NumberedTextarea value={text} onChange={setText} placeholder={PLACEHOLDER} />
            <p className="text-muted mt-2 text-xs">
              {inputLines} lines · {text.length} characters
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Output</p>
              {outputToggle}
            </div>
            {outputBody}
          </div>
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-4 lg:sticky lg:top-20">
        <div>
          <p className="text-sm font-semibold">Duplicate Options</p>
          <p className="text-muted text-xs">Choose how to find and handle duplicates.</p>
        </div>

        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-semibold">Match Type</p>
          <OptionRadioRow
            name="match-type"
            label="Exact Match"
            description="Match lines exactly."
            checked={matchType === 'exact'}
            onSelect={() => setMatchType('exact')}
          />
          <OptionRadioRow
            name="match-type"
            label="Case Insensitive"
            description="Match lines without case sensitivity."
            checked={matchType === 'case_insensitive'}
            onSelect={() => setMatchType('case_insensitive')}
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-semibold">Keep Which Occurrence</p>
          <OptionRadioRow
            name="keep-occurrence"
            label="Keep First Occurrence"
            description="Remove later duplicates."
            checked={keepOccurrence === 'first'}
            onSelect={() => setKeepOccurrence('first')}
          />
          <OptionRadioRow
            name="keep-occurrence"
            label="Keep Last Occurrence"
            description="Remove earlier duplicates."
            checked={keepOccurrence === 'last'}
            onSelect={() => setKeepOccurrence('last')}
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Advanced Options</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ignoreSpaces}
              onChange={(event) => setIgnoreSpaces(event.target.checked)}
              className="accent-brand size-4"
            />
            Ignore leading and trailing spaces
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ignoreEmptyLines}
              onChange={(event) => setIgnoreEmptyLines(event.target.checked)}
              className="accent-brand size-4"
            />
            Ignore empty lines
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={highlightDuplicates}
              onChange={(event) => setHighlightDuplicates(event.target.checked)}
              className="accent-brand size-4"
            />
            Highlight duplicates
          </label>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={copyResult}>
            {copied ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <Copy aria-hidden className="size-4" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button className="flex-1" onClick={downloadResult}>
            <Download aria-hidden className="size-4" />
            Download
          </Button>
        </div>
      </aside>
    </div>
  );
}
