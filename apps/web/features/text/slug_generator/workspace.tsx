'use client';

import { useState } from 'react';
import {
  ArrowRight,
  Ban,
  CaseLower,
  Check,
  Copy,
  Download,
  Globe,
  Info,
  Lightbulb,
  Minus,
  Ruler,
} from 'lucide-react';
import { TextToolbar } from '@/components/text/text_toolbar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { generateSlug } from '@/lib/text/slug_generator';

const PLACEHOLDER = 'Enter your title here…';
const MAX_TITLE_LENGTH = 500;

const TIPS: readonly { icon: typeof Ruler; text: string }[] = [
  { icon: Ruler, text: 'Keep it short and descriptive.' },
  { icon: Minus, text: 'Use hyphens (-) to separate words.' },
  { icon: Ban, text: 'Avoid using special characters.' },
  { icon: CaseLower, text: 'Lowercase is recommended for better SEO.' },
  { icon: Info, text: 'Ideal slug length: 3 to 75 characters.' },
];

export function SlugGeneratorWorkspace() {
  const [title, setTitle] = useState('');
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const slug = generateSlug(title);

  async function copySlug() {
    await navigator.clipboard.writeText(slug);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadSlug() {
    setNotice(null);
    try {
      const processor = await loadProcessor('text.slug-generator');
      const output = await processor(
        { files: [], text: title, options: {} },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That file could not be created.');
    }
  }

  const slugOutput = (
    <>
      <Textarea
        value={slug}
        readOnly
        placeholder="Your slug will appear here…"
        className="font-mono min-h-0 flex-1 resize-none"
      />
      <p className="bg-cream/40 border-border mt-3 overflow-x-auto rounded-xl border p-3 font-mono text-sm break-all">
        <span className="text-muted">https://yourwebsite.com/</span>
        <span className="text-success">{slug || 'your-slug-here'}</span>
      </p>
    </>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="border-border bg-surface rounded-2xl border p-4">
        <TextToolbar
          value={title}
          onChange={setTitle}
          placeholder={PLACEHOLDER}
          autosaveKey="slug-generator"
          inputLabel="Input Title"
          expandedOutput={slugOutput}
          expandedOutputLabel="Generated Slug"
        />

        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Input Title</p>
              <p className="text-muted text-xs">
                {title.length} / {MAX_TITLE_LENGTH}
              </p>
            </div>
            <Textarea
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, MAX_TITLE_LENGTH))}
              placeholder={PLACEHOLDER}
              maxLength={MAX_TITLE_LENGTH}
              className="min-h-[40vh]"
            />
            <p className="text-muted mt-2 text-xs">{title.length.toLocaleString()} characters</p>
          </div>

          <div className="hidden items-center justify-center sm:flex">
            <span className="border-border bg-background text-muted flex size-8 items-center justify-center rounded-full border">
              <ArrowRight aria-hidden className="size-4" />
            </span>
          </div>

          <div className="min-w-0">
            <p className="mb-2 text-sm font-semibold">Generated Slug</p>
            <Textarea
              value={slug}
              readOnly
              placeholder="Your slug will appear here…"
              className="font-mono min-h-[40vh]"
            />
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={copySlug}>
                {copied ? (
                  <Check aria-hidden className="size-4" />
                ) : (
                  <Copy aria-hidden className="size-4" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button className="flex-1" onClick={downloadSlug}>
                <Download aria-hidden className="size-4" />
                Download
              </Button>
            </div>
            {notice && <p className="text-danger mt-2 text-xs">{notice}</p>}
          </div>
        </div>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <div className="border-border bg-surface rounded-2xl border p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Lightbulb aria-hidden className="text-brand size-4" />
            Tips
          </p>
          <ul className="flex flex-col gap-2.5">
            {TIPS.map((tip) => (
              <li key={tip.text} className="flex items-start gap-2.5 text-sm">
                <tip.icon aria-hidden className="text-muted mt-0.5 size-4 shrink-0" />
                <span>{tip.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-border bg-surface rounded-2xl border p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Globe aria-hidden className="text-brand size-4" />
            Preview
          </p>
          <p className="bg-cream/40 border-border overflow-x-auto rounded-xl border p-3 font-mono text-sm break-all">
            <span className="text-muted">https://yourwebsite.com/</span>
            <span className="text-success">{slug || 'your-slug-here'}</span>
          </p>
        </div>
      </aside>
    </div>
  );
}
