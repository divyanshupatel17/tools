'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { TextFooterCount, TextToolbar } from '@/components/text/text_toolbar';
import { Textarea } from '@/components/ui/textarea';
import { downloadBlob } from '@/lib/browser/download';
import { CASE_OPTIONS, convertCase, type CaseId } from '@/lib/text/case_converter';
import { cn } from '@/lib/utils/cn';

const PLACEHOLDER = 'Paste or type your text here…';

export function CaseConverterWorkspace() {
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<CaseId>('sentence');
  const [copiedId, setCopiedId] = useState<CaseId | null>(null);

  const conversions = useMemo(() => {
    const map = {} as Record<CaseId, string>;
    for (const option of CASE_OPTIONS) map[option.id] = convertCase(input, option.id);
    return map;
  }, [input]);

  const converted = conversions[selected];

  async function copyCase(id: CaseId) {
    await navigator.clipboard.writeText(conversions[id]);
    setCopiedId(id);
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
  }

  function downloadCase(id: CaseId) {
    const option = CASE_OPTIONS.find((entry) => entry.id === id);
    downloadBlob(
      new Blob([conversions[id]], { type: 'text/plain' }),
      `${option?.fileName ?? id}.txt`,
    );
  }

  const convertedOutput = (
    <>
      <Textarea
        value={converted}
        readOnly
        placeholder="The converted text will appear here."
        className="font-mono min-h-0 flex-1 resize-none"
      />
      <TextFooterCount value={converted} />
    </>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <TextToolbar
          value={input}
          onChange={setInput}
          placeholder={PLACEHOLDER}
          autosaveKey="case-converter"
          inputLabel="Input Text"
          expandedOutput={convertedOutput}
          expandedOutputLabel="Converted Text"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold">Input Text</p>
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={PLACEHOLDER}
              className="font-mono min-h-[45vh]"
            />
            <TextFooterCount value={input} />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Converted Text</p>
            <Textarea
              value={converted}
              readOnly
              placeholder="The converted text will appear here."
              className="font-mono min-h-[45vh]"
            />
            <TextFooterCount value={converted} />
          </div>
        </div>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-3 rounded-2xl border p-4 lg:sticky lg:top-20">
        <p className="text-sm font-semibold">Select Case</p>
        <div className="flex flex-col gap-2">
          {CASE_OPTIONS.map((option) => {
            const isSelected = option.id === selected;
            return (
              <div
                key={option.id}
                className={cn(
                  'flex items-center gap-1 rounded-xl border p-1.5 transition-colors',
                  isSelected ? 'border-brand bg-cream/60' : 'border-border hover:bg-surface-muted',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelected(option.id)}
                  aria-pressed={isSelected}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left"
                >
                  <span className="border-border bg-background flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
                    {option.monogram}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {option.label}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void copyCase(option.id)}
                  aria-label={`Copy ${option.label}`}
                  className="text-muted hover:text-foreground shrink-0 rounded-full p-1.5"
                >
                  {copiedId === option.id ? (
                    <Check aria-hidden className="text-success size-4" />
                  ) : (
                    <Copy aria-hidden className="size-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => downloadCase(option.id)}
                  aria-label={`Download ${option.label}`}
                  className="text-muted hover:text-foreground shrink-0 rounded-full p-1.5"
                >
                  <Download aria-hidden className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-muted text-xs">
          Each result can be copied or downloaded individually.
        </p>
      </aside>
    </div>
  );
}
