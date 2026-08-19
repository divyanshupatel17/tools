'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  CaseSensitive,
  Check,
  Code2,
  Copy,
  Download,
  Quote,
  Rows3,
  Smile,
  SquareDashed,
} from 'lucide-react';
import { CheckboxOptionCard, ControlPanel } from '@/components/text/control_panel';
import { TextFooterCount, TextToolbar } from '@/components/text/text_toolbar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import {
  CLEAN_OPTIONS,
  cleanText,
  DEFAULT_CLEAN_OPTIONS,
  type CleanOptionId,
  type CleanOptions,
} from '@/lib/text/text_cleaner';

const PLACEHOLDER = 'Enter or paste your text here…';
const MAX_LENGTH = 50000;

const ICONS: Record<CleanOptionId, typeof ArrowLeftRight> = {
  extra_spaces: ArrowLeftRight,
  blank_lines: Rows3,
  invisible_characters: SquareDashed,
  emojis: Smile,
  accents: CaseSensitive,
  smart_quotes: Quote,
  html_tags: Code2,
};

export function TextCleanerWorkspace() {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<CleanOptions>(DEFAULT_CLEAN_OPTIONS);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const cleaned = useMemo(() => cleanText(text, options), [text, options]);

  function toggleOption(id: CleanOptionId) {
    setOptions((current) => ({ ...current, [id]: !current[id] }));
  }

  async function copyCleaned() {
    await navigator.clipboard.writeText(cleaned);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadCleaned() {
    setNotice(null);
    try {
      const processor = await loadProcessor('text.text-cleaner');
      const output = await processor(
        { files: [], text, options },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That file could not be created.');
    }
  }

  const cleanedOutput = (
    <>
      <Textarea
        value={cleaned}
        readOnly
        placeholder="The cleaned text will appear here."
        className="font-mono min-h-0 flex-1 resize-none"
      />
      <TextFooterCount value={cleaned} />
    </>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <TextToolbar
          value={text}
          onChange={(value) => setText(value.slice(0, MAX_LENGTH))}
          placeholder={PLACEHOLDER}
          autosaveKey="text-cleaner"
          inputLabel="Input Text"
          expandedOutput={cleanedOutput}
          expandedOutputLabel="Cleaned Text"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Input Text</p>
              <p className="text-muted text-xs">
                {text.length} / {MAX_LENGTH}
              </p>
            </div>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, MAX_LENGTH))}
              placeholder={PLACEHOLDER}
              maxLength={MAX_LENGTH}
              className="font-mono min-h-[45vh]"
            />
            <TextFooterCount value={text} />
          </div>

          <div className="hidden items-center justify-center sm:flex">
            <span className="border-border bg-background text-muted flex size-8 items-center justify-center rounded-full border">
              <ArrowRight aria-hidden className="size-4" />
            </span>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Cleaned Text</p>
            <Textarea
              value={cleaned}
              readOnly
              placeholder="The cleaned text will appear here."
              className="font-mono min-h-[45vh]"
            />
            <TextFooterCount value={cleaned} />
            {notice && <p className="text-danger mt-1 text-xs">{notice}</p>}
          </div>
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        <ControlPanel>
          <div>
            <p className="text-sm font-semibold">Cleaning Options</p>
            <p className="text-muted text-xs">Choose what you want to remove.</p>
          </div>
          <div className="flex flex-col gap-2">
            {CLEAN_OPTIONS.map((option) => (
              <CheckboxOptionCard
                key={option.id}
                icon={ICONS[option.id]}
                label={option.label}
                description={option.description}
                checked={options[option.id]}
                onToggle={() => toggleOption(option.id)}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={copyCleaned}>
              {copied ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button className="flex-1" onClick={downloadCleaned}>
              <Download aria-hidden className="size-4" />
              Download
            </Button>
          </div>
        </ControlPanel>
      </aside>
    </div>
  );
}
