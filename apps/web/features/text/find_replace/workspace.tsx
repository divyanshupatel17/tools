'use client';

import { useRef, useState, type ComponentType } from 'react';
import {
  CaseSensitive,
  Check,
  Copy,
  Download,
  FileText,
  Lightbulb,
  Pencil,
  Regex,
  Search,
  SlidersHorizontal,
  Upload,
  WholeWord,
} from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { TextFooterCount, TextToolbar } from '@/components/text/text_toolbar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { findMatches, replaceAll, replaceOne, type FindReplaceOptions } from '@/lib/text/find_replace';
import { cn } from '@/lib/utils/cn';

const PLACEHOLDER = 'Enter or paste your text here…';

const HOW_IT_WORKS = [
  { icon: FileText, text: 'Enter the text you want to work on in the input box.' },
  { icon: Pencil, text: 'Type the text you want to find and what you want to replace it with.' },
  { icon: SlidersHorizontal, text: 'Use the options to match exactly how you need.' },
  { icon: Search, text: 'Click Find to see matches, or Replace All to make changes.' },
  { icon: Upload, text: 'You can upload a file or paste your content directly.' },
];

const TIPS = [
  'Use Regular expression for advanced matching.',
  'Whole word ensures only complete words are matched.',
  'Case sensitive will match uppercase and lowercase exactly.',
];

function ToggleChip({
  icon: Icon,
  label,
  active,
  onToggle,
}: {
  icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-brand bg-cream text-foreground'
          : 'border-border text-muted hover:text-foreground',
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </button>
  );
}

export function FindReplaceWorkspace() {
  const [text, setText] = useState('');
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const options: FindReplaceOptions = {
    case_sensitive: caseSensitive,
    whole_word: wholeWord,
    regex: useRegex,
  };

  function focusMatch(index: number, length: number) {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(index, index + length);
  }

  function handleFind() {
    if (find === '') {
      setNotice('Type something to find first.');
      return;
    }
    try {
      const matches = findMatches(text, find, options);
      if (matches.length === 0) {
        setNotice('No matches found.');
        return;
      }
      const cursor = textareaRef.current?.selectionEnd ?? 0;
      const next = matches.find((match) => match.index >= cursor) ?? matches[0]!;
      focusMatch(next.index, next.length);
      const position = matches.indexOf(next) + 1;
      setNotice(`Match ${position} of ${matches.length}. Click Find again for the next one.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That pattern is not valid.');
    }
  }

  function handleReplace() {
    if (find === '') {
      setNotice('Type something to find first.');
      return;
    }
    try {
      const fromIndex = textareaRef.current?.selectionStart ?? 0;
      const { text: next, replacedAt } = replaceOne(text, find, replace, options, fromIndex);
      if (replacedAt === null) {
        setNotice('No matches found.');
        return;
      }
      setText(next);
      setNotice('Replaced 1 match.');
      requestAnimationFrame(() => focusMatch(replacedAt, replace.length));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That pattern is not valid.');
    }
  }

  async function copyText() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadText() {
    setNotice(null);
    try {
      const processor = await loadProcessor('text.find-replace');
      const output = await processor(
        { files: [], text, options: {} },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That file could not be created.');
    }
  }

  function handleReplaceAll() {
    if (find === '') {
      setNotice('Type something to find first.');
      return;
    }
    try {
      const matches = findMatches(text, find, options);
      if (matches.length === 0) {
        setNotice('No matches found.');
        return;
      }
      setText(replaceAll(text, find, replace, options));
      setNotice(`Replaced ${matches.length} ${matches.length === 1 ? 'match' : 'matches'}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That pattern is not valid.');
    }
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <TextToolbar
          value={text}
          onChange={setText}
          placeholder={PLACEHOLDER}
          autosaveKey="find-replace"
          inputLabel="Input Text"
        />

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-semibold">Find</span>
            <div className="relative mt-1.5">
              <input
                type="text"
                value={find}
                onChange={(event) => setFind(event.target.value)}
                placeholder="Enter text to find"
                className="border-border bg-background w-full rounded-xl border py-2.5 pl-4 pr-10 text-sm outline-none"
              />
              <Search
                aria-hidden
                className="text-muted pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2"
              />
            </div>
          </label>

          <label className="text-sm">
            <span className="font-semibold">Replace with</span>
            <input
              type="text"
              value={replace}
              onChange={(event) => setReplace(event.target.value)}
              placeholder="Enter replacement text"
              className="border-border bg-background mt-1.5 w-full rounded-xl border px-4 py-2.5 text-sm outline-none"
            />
          </label>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ToggleChip
            icon={CaseSensitive}
            label="Case sensitive"
            active={caseSensitive}
            onToggle={() => setCaseSensitive((value) => !value)}
          />
          <ToggleChip
            icon={WholeWord}
            label="Whole word"
            active={wholeWord}
            onToggle={() => setWholeWord((value) => !value)}
          />
          <ToggleChip
            icon={Regex}
            label="Regular expression"
            active={useRegex}
            onToggle={() => setUseRegex((value) => !value)}
          />

          <span className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleFind}>
              <Search aria-hidden className="size-4" />
              Find
            </Button>
            <Button variant="secondary" size="sm" onClick={handleReplace}>
              <Pencil aria-hidden className="size-4" />
              Replace
            </Button>
            <Button size="sm" onClick={handleReplaceAll}>
              <SlidersHorizontal aria-hidden className="size-4" />
              Replace All
            </Button>
          </span>
        </div>

        {notice && (
          <div className="mb-4">
            <Notice variant="info">{notice}</Notice>
          </div>
        )}

        <p className="mb-2 text-sm font-semibold">Input Text</p>
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={PLACEHOLDER}
          className="font-mono min-h-[40vh]"
        />
        <TextFooterCount value={text} />
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <div className="border-border bg-surface rounded-2xl border p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Lightbulb aria-hidden className="text-brand size-4" />
            How it works
          </p>
          <ul className="flex flex-col gap-3">
            {HOW_IT_WORKS.map((step) => (
              <li key={step.text} className="flex items-start gap-2.5 text-sm">
                <span className="border-border bg-background flex size-8 shrink-0 items-center justify-center rounded-full border">
                  <step.icon aria-hidden className="text-brand size-4" />
                </span>
                <span className="pt-1.5">{step.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-border bg-surface rounded-2xl border p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Lightbulb aria-hidden className="text-brand size-4" />
            Tips
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {TIPS.map((tip) => (
              <li key={tip} className="flex items-start gap-2">
                <span className="bg-muted mt-2 size-1 shrink-0 rounded-full" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-border bg-surface rounded-2xl border p-4">
          <p className="mb-3 text-sm font-semibold">Input Text</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={copyText}>
              {copied ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button className="flex-1" onClick={downloadText}>
              <Download aria-hidden className="size-4" />
              Download
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
