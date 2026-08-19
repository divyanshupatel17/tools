'use client';

import { useEffect, useRef, useState } from 'react';
import { ClipboardList, Download, Loader2, Maximize2, TriangleAlert } from 'lucide-react';
import { formatBytes, safeFileName, type FileRule } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { PageDetailModal } from '@/components/pdf/page_detail_modal';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { getPdfPageSize, renderPdfPage } from '@/lib/pdf/pdf_pages';
import { readPdfPreview } from '@/lib/pdf/pdf_preview';
import { loadProcessor } from '@/lib/processing/processor_registry';

const MAX_BYTES = 200 * 1024 * 1024;
const RULE: FileRule = {
  mime_types: ['application/pdf'],
  extensions: ['pdf'],
  max_files: 1,
  max_bytes: MAX_BYTES,
};
const PREVIEW_WIDTH = 560;
const PREVIEW_DEBOUNCE_MS = 400;

type FieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'options' | 'unsupported';

interface FormField {
  name: string;
  kind: FieldKind;
  options: string[];
  value: string | string[] | boolean;
  /** Page the field's widget lives on, so an edit can re-render just that page. */
  pageIndex: number;
}

interface Result {
  artifact: ProcessorArtifact;
  filled: number;
}

/** Reads every AcroForm field via pdf-lib's typed API (imported dynamically so a tool page that
 * never opens a form-bearing PDF never pays for it) and renders the matching control per type. */
async function readFields(file: File): Promise<FormField[]> {
  const { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } =
    await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const form = pdfDoc.getForm();
  const pageRefs = pdfDoc.getPages().map((page) => page.ref);

  return form.getFields().map((field): FormField => {
    const name = field.getName();
    const widgetPageRef = field.acroField.getWidgets()[0]?.P();
    const found = widgetPageRef
      ? pageRefs.findIndex((ref) => ref.tag === widgetPageRef.tag)
      : -1;
    const pageIndex = found === -1 ? 0 : found;

    if (field instanceof PDFTextField) {
      return { name, kind: 'text', options: [], value: field.getText() ?? '', pageIndex };
    }
    if (field instanceof PDFCheckBox) {
      return { name, kind: 'checkbox', options: [], value: field.isChecked(), pageIndex };
    }
    if (field instanceof PDFRadioGroup) {
      return {
        name,
        kind: 'radio',
        options: field.getOptions(),
        value: field.getSelected() ?? '',
        pageIndex,
      };
    }
    if (field instanceof PDFDropdown) {
      return {
        name,
        kind: 'dropdown',
        options: field.getOptions(),
        value: field.getSelected(),
        pageIndex,
      };
    }
    if (field instanceof PDFOptionList) {
      return {
        name,
        kind: 'options',
        options: field.getOptions(),
        value: field.getSelected(),
        pageIndex,
      };
    }
    return { name, kind: 'unsupported', options: [], value: '', pageIndex };
  });
}

/** Fills fields into a fresh in-memory copy of the source bytes and renders one page, for a
 * preview that stays live as the user types. Skips flatten and the processor's progress
 * plumbing since this only ever feeds an `<img>`, never the download. */
async function renderFilledPage(
  file: File,
  pageIndex: number,
  values: Record<string, string | string[] | boolean>,
  signal: AbortSignal,
): Promise<{ image: string; size: { width: number; height: number } }> {
  const [{ PDFDocument }, { fillFormFields }] = await Promise.all([
    import('pdf-lib'),
    import('./processor'),
  ]);
  const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  fillFormFields(pdfDoc.getForm(), values);
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  const filledFile = new File([new Uint8Array(bytes)], file.name, { type: 'application/pdf' });

  const [image, size] = await Promise.all([
    renderPdfPage(filledFile, pageIndex, PREVIEW_WIDTH, signal),
    getPdfPageSize(filledFile, pageIndex, signal),
  ]);
  return { image, size };
}

export function PdfFormsWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [flatten, setFlatten] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [viewingSource, setViewingSource] = useState(false);
  const [viewingResult, setViewingResult] = useState(false);

  const [pageCount, setPageCount] = useState<number | null>(null);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      previewAbort.current?.abort();
      if (previewTimer.current) clearTimeout(previewTimer.current);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;
    setFile(next);
    setResult(null);
    setResultFile(null);
    setNotice(null);
    setFields(null);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreviewSrc(null);
    setPageSize(null);

    try {
      const [found, preview] = await Promise.all([readFields(next), readPdfPreview(next)]);
      if (preview.thumbnail) URL.revokeObjectURL(preview.thumbnail);
      setPageCount(preview.pages);
      setFields(found);
      if (found.length === 0) setNotice('This PDF has no fillable form fields.');

      const fillableFields = found.filter((field) => field.kind !== 'unsupported');
      const startPage =
        fillableFields.length > 0
          ? Math.min(...fillableFields.map((field) => field.pageIndex))
          : 0;
      setPreviewPageIndex(startPage);

      const [image, size] = await Promise.all([
        renderPdfPage(next, startPage, PREVIEW_WIDTH),
        getPdfPageSize(next, startPage),
      ]);
      previewUrl.current = image;
      setPreviewSrc(image);
      setPageSize(size);
    } catch {
      setNotice('That file could not be read as a PDF.');
    }
  }

  function refreshPreview(nextFields: FormField[], pageIndex: number) {
    if (!file) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      previewAbort.current?.abort();
      const controller = new AbortController();
      previewAbort.current = controller;
      setPreviewLoading(true);

      const values = Object.fromEntries(nextFields.map((field) => [field.name, field.value]));
      renderFilledPage(file, pageIndex, values, controller.signal)
        .then(({ image, size }) => {
          if (controller.signal.aborted) {
            URL.revokeObjectURL(image);
            return;
          }
          if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
          previewUrl.current = image;
          setPreviewSrc(image);
          setPageSize(size);
          setPreviewPageIndex(pageIndex);
        })
        .catch(() => {
          // A failed live-fill keeps the last good preview rather than erroring the page.
        })
        .finally(() => {
          if (previewAbort.current === controller) {
            previewAbort.current = null;
            setPreviewLoading(false);
          }
        });
    }, PREVIEW_DEBOUNCE_MS);
  }

  function updateField(name: string, value: FormField['value']) {
    if (!fields) return;
    const next = fields.map((field) => (field.name === name ? { ...field, value } : field));
    setFields(next);
    setResult(null);
    setResultFile(null);

    const edited = next.find((field) => field.name === name);
    refreshPreview(next, edited?.pageIndex ?? previewPageIndex);
  }

  const busy = progress !== null;
  const fillable = fields?.filter((field) => field.kind !== 'unsupported') ?? [];
  const canRun = file !== null && fillable.length > 0 && !busy;

  async function run() {
    if (!file || !canRun || !fields) return;
    setNotice(null);
    setResult(null);
    setResultFile(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('pdf.pdf-forms');
      const values = Object.fromEntries(fields.map((field) => [field.name, field.value]));
      const output = await processor(
        { files: [file], options: { values, flatten } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact, filled: Number(output.text ?? 0) });
        setResultFile(new File([artifact.blob], artifact.file_name, { type: artifact.mime_type }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'This form could not be filled.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  const percent = Math.round((progress?.ratio ?? 0) * 100);

  if (!file) {
    return (
      <div className="flex flex-col gap-4">
        <FileUpload rule={RULE} accept="application/pdf,.pdf" onFiles={addFile} />
        {notice && (
          <p role="alert" className="text-danger flex items-start gap-2 text-sm">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {notice}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="border-border bg-surface flex flex-col items-center rounded-2xl border p-4">
        <p className="text-muted mb-3 self-start text-sm">
          <span className="text-foreground font-semibold">{safeFileName(file.name)}</span>
          {' · '}
          {pageCount ?? '·'} page{pageCount === 1 ? '' : 's'} · {formatBytes(file.size)}
          {' · '}
          {fields === null
            ? 'Reading form fields…'
            : `${fillable.length} fillable field${fillable.length === 1 ? '' : 's'}`}
        </p>

        <div
          className="border-border bg-cream relative overflow-hidden rounded-xl border shadow-sm"
          style={{
            width: PREVIEW_WIDTH,
            maxWidth: '100%',
            aspectRatio: pageSize ? `${pageSize.width} / ${pageSize.height}` : '3 / 4',
          }}
        >
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt={`Page ${previewPageIndex + 1} preview`}
              className="size-full object-contain"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Loader2 aria-hidden className="text-muted size-6 animate-spin" />
            </div>
          )}
          {previewLoading && (
            <div className="bg-surface/80 border-border absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
              <Loader2 aria-hidden className="size-3 animate-spin" />
              Updating preview
            </div>
          )}
          {previewSrc && (
            <button
              type="button"
              onClick={() => setViewingSource(true)}
              aria-label={`View ${safeFileName(file.name)}`}
              title="View the full document"
              className="bg-surface/90 border-border text-muted hover:text-foreground absolute right-1 bottom-1 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border shadow-sm"
            >
              <Maximize2 aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
        <p className="text-muted mt-2 text-center text-xs">
          {pageCount && pageCount > 1
            ? `Live preview of page ${previewPageIndex + 1} · click the corner icon to view the full document`
            : 'Live preview · click the corner icon to view the full document'}
        </p>
      </div>

      <aside className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4 lg:sticky lg:top-20">
        {notice && (
          <p role="alert" className="text-danger flex items-start gap-2 text-xs">
            <TriangleAlert aria-hidden className="mt-px size-4 shrink-0" />
            {notice}
          </p>
        )}

        {fillable.length > 0 && (
          <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto pr-1">
            {fillable.map((field) => (
              <label key={field.name} className="text-sm">
                <span className="font-semibold">{field.name}</span>
                {field.kind === 'text' && (
                  <input
                    value={field.value as string}
                    onChange={(event) => updateField(field.name, event.target.value)}
                    disabled={busy}
                    className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
                  />
                )}
                {field.kind === 'checkbox' && (
                  <span className="mt-1.5 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={field.value as boolean}
                      onChange={(event) => updateField(field.name, event.target.checked)}
                      disabled={busy}
                      className="accent-brand size-4"
                    />
                    <span className="text-muted text-xs">Checked</span>
                  </span>
                )}
                {(field.kind === 'radio' || field.kind === 'dropdown') && (
                  <select
                    value={
                      Array.isArray(field.value) ? (field.value[0] ?? '') : (field.value as string)
                    }
                    onChange={(event) => updateField(field.name, event.target.value)}
                    disabled={busy}
                    className="border-border bg-background mt-1.5 h-11 w-full rounded-full border px-4 outline-none"
                  >
                    <option value="">Choose…</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
                {field.kind === 'options' && (
                  <select
                    multiple
                    value={Array.isArray(field.value) ? field.value : []}
                    onChange={(event) =>
                      updateField(
                        field.name,
                        Array.from(event.target.selectedOptions, (option) => option.value),
                      )
                    }
                    disabled={busy}
                    className="border-border bg-background mt-1.5 w-full rounded-xl border p-2 outline-none"
                  >
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            ))}
          </div>
        )}

        {fillable.length > 0 && (
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={flatten}
              onChange={(event) => setFlatten(event.target.checked)}
              disabled={busy}
              className="accent-brand size-4"
            />
            <span className="font-semibold">Flatten after filling (can no longer be edited)</span>
          </label>
        )}

        {busy && (
          <div>
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progress"
              className="bg-cream h-2 w-full overflow-hidden rounded-full"
            >
              <div
                className="bg-brand h-full rounded-full transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-muted mt-1.5 text-xs">
              {progress?.label ?? 'Working'} · {percent}%
            </p>
          </div>
        )}

        <Button onClick={run} disabled={!canRun} className="h-12 w-full text-base">
          {busy ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <ClipboardList aria-hidden className="size-4" />
          )}
          {busy ? `Filling ${percent}%` : 'Fill form'}
        </Button>

        {result && resultFile && (
          <section
            aria-label="Filled document"
            className="border-brand bg-cream flex flex-col gap-3 rounded-xl border p-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{result.artifact.file_name}</span>
              <span className="text-muted block text-xs">
                {result.filled} field{result.filled === 1 ? '' : 's'} filled ·{' '}
                {formatBytes(result.artifact.blob.size)}
              </span>
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setViewingResult(true)}>
                <Maximize2 aria-hidden className="size-4" />
                View
              </Button>
              <Button
                className="flex-1"
                onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}
              >
                <Download aria-hidden className="size-4" />
                Download
              </Button>
            </div>
          </section>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            previewAbort.current?.abort();
            if (previewTimer.current) clearTimeout(previewTimer.current);
            if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
            previewUrl.current = null;
            setFile(null);
            setFields(null);
            setResult(null);
            setResultFile(null);
            setNotice(null);
            setPreviewSrc(null);
            setPageSize(null);
            setPageCount(null);
            setPreviewPageIndex(0);
          }}
          disabled={busy}
        >
          Choose a different file
        </Button>
      </aside>

      {viewingSource && (
        <PageDetailModal
          file={file}
          pageIndex={previewPageIndex}
          onClose={() => setViewingSource(false)}
        />
      )}
      {viewingResult && resultFile && (
        <PageDetailModal file={resultFile} pageIndex={0} onClose={() => setViewingResult(false)} />
      )}
    </div>
  );
}
