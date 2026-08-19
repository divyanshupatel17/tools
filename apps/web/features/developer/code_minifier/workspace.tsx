'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type UIEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Clipboard,
  Copy,
  Download,
  FileDown,
  Loader2,
  Maximize2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Notice, StatGrid, StatTile } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/browser/download';
import { importTextFile, TEXT_IMPORT_ACCEPT } from '@/lib/text/file_import';
import { loadProcessor } from '@/lib/processing/processor_registry';
import {
  DEFAULT_CODE_MINIFY_OPTIONS,
  minifyCode,
  type CodeMinifyOptions,
  type CodeMinifyResult,
} from './minify';
import { LANGUAGES, languageById, detectLanguageId } from './languages';

const AUTOSAVE_KEY = 'text-tool:code-minifier';
const PLACEHOLDER = 'Paste or type code to minify it…';

interface HljsModule {
  getLanguage: (id: string) => unknown;
  highlight: (code: string, options: { language: string; ignoreIllegals: boolean }) => {
    value: string;
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * A gutter plus a highlighted, read only view sitting behind a transparent, caret only
 * textarea — the standard technique for an editable box that still shows syntax colours,
 * since a real `<textarea>` cannot render coloured spans itself.
 */
function CodeEditorPanel({
  value,
  onChange,
  hljs,
  hljsLanguage,
  highlightEnabled,
  onScroll,
  readOnly,
  textareaRef,
  placeholder,
  fillHeight,
}: {
  value: string;
  onChange?: (value: string) => void;
  hljs: HljsModule | null;
  hljsLanguage: string;
  highlightEnabled: boolean;
  onScroll?: (event: UIEvent<HTMLTextAreaElement>) => void;
  readOnly?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  /** Fills the flex parent's height instead of using a fixed default height — used in the
   * fullscreen dialog, which already has real vertical room to give away. */
  fillHeight?: boolean;
}) {
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const fallbackTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeTextareaRef = textareaRef ?? fallbackTextareaRef;
  const lineCount = value === '' ? 1 : value.split('\n').length;

  const highlightedHtml = useMemo(() => {
    if (!highlightEnabled || !hljs) return escapeHtml(value);
    try {
      const known = hljsLanguage !== 'plaintext' && hljs.getLanguage(hljsLanguage);
      const result = known
        ? hljs.highlight(value, { language: hljsLanguage, ignoreIllegals: true })
        : { value: escapeHtml(value) };
      return result.value;
    } catch {
      return escapeHtml(value);
    }
  }, [value, hljs, hljsLanguage, highlightEnabled]);

  function syncScrollPositions(source: HTMLElement) {
    if (gutterRef.current) gutterRef.current.scrollTop = source.scrollTop;
    if (preRef.current) {
      preRef.current.scrollTop = source.scrollTop;
      preRef.current.scrollLeft = source.scrollLeft;
    }
  }

  return (
    <div
      className={`code-panel border-border bg-background flex resize-y overflow-hidden rounded-2xl border ${fillHeight ? 'h-full min-h-0 flex-1' : 'h-[45vh]'}`}
    >
      <div
        ref={gutterRef}
        aria-hidden
        className="text-muted bg-surface-muted/40 border-border shrink-0 overflow-hidden border-r py-4 pr-2 pl-3 text-right font-mono text-sm leading-6 select-none"
      >
        {Array.from({ length: lineCount }, (_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <pre
          ref={preRef}
          aria-hidden
          className="hljs pointer-events-none absolute inset-0 m-0 overflow-auto p-4 font-mono text-sm leading-6 whitespace-pre"
        >
          <code
            className={`hljs${highlightEnabled && hljsLanguage !== 'plaintext' ? ` language-${hljsLanguage}` : ''}`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml || '​' }}
          />
        </pre>
        <textarea
          ref={activeTextareaRef}
          value={value}
          onChange={
            onChange && !readOnly ? (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value) : undefined
          }
          onScroll={(event) => {
            syncScrollPositions(event.currentTarget);
            onScroll?.(event);
          }}
          readOnly={readOnly}
          placeholder={placeholder}
          spellCheck={false}
          wrap="off"
          className="absolute inset-0 min-w-0 resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-6 whitespace-pre text-transparent caret-foreground outline-none selection:bg-brand/30"
        />
      </div>
    </div>
  );
}

export function CodeMinifierWorkspace() {
  const [source, setSource] = useState('');
  const [languageId, setLanguageId] = useState('auto');
  const [minifyOptions, setMinifyOptions] = useState<CodeMinifyOptions>(DEFAULT_CODE_MINIFY_OPTIONS);
  const [syntaxHighlighting, setSyntaxHighlighting] = useState(true);
  const [syncScroll, setSyncScroll] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hljs, setHljs] = useState<HljsModule | null>(null);
  const [result, setResult] = useState<CodeMinifyResult | null>(null);
  const [minifying, setMinifying] = useState(false);

  const restored = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const outputTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const syncingRef = useRef(false);

  const isAuto = languageId === 'auto';
  const detectedId = useMemo(
    () => (isAuto ? detectLanguageId(source) : languageId),
    [isAuto, languageId, source],
  );
  const language = languageById(detectedId);

  useEffect(() => {
    let cancelled = false;
    void import('highlight.js/lib/common').then((module) => {
      if (!cancelled) setHljs(module.default as unknown as HljsModule);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const draft = window.localStorage.getItem(AUTOSAVE_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as { source?: string; language?: string };
        // Restoring a saved draft from localStorage on mount, not a value derived from props or
        // state — there is no dependency this effect could instead synchronize with.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed.source) setSource(parsed.source);
        if (parsed.language) setLanguageId(parsed.language);
      } catch {
        // Ignore a corrupted draft rather than blocking the tool from loading.
      }
    }
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    if (source === '') {
      window.localStorage.removeItem(AUTOSAVE_KEY);
      return;
    }
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ source, language: languageId }));
  }, [source, languageId]);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  // Debounced so a fast typist does not re-run terser/csso on every keystroke. The "minifying"
  // indicator flips on once the debounce actually fires, not synchronously in the effect body,
  // so this never triggers a same-render cascading setState.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setMinifying(true);
      void minifyCode(source, detectedId, minifyOptions).then((next) => {
        if (!cancelled) {
          setResult(next);
          setMinifying(false);
        }
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, detectedId, minifyOptions]);

  const outputText = result?.output ?? '';
  const inputLines = source === '' ? 0 : source.split('\n').length;
  const inputChars = source.length;
  const outputLines = outputText === '' ? 0 : outputText.split('\n').length;
  const outputChars = outputText.length;
  const saved = source !== '';

  const originalBytes = result?.originalBytes ?? 0;
  const minifiedBytes = result?.minifiedBytes ?? 0;
  const savedBytes = Math.max(0, originalBytes - minifiedBytes);
  const savedPercent = originalBytes > 0 ? Math.round((savedBytes / originalBytes) * 100) : 0;

  function updateMinifyOption<K extends keyof CodeMinifyOptions>(key: K, value: CodeMinifyOptions[K]) {
    setMinifyOptions((current) => ({ ...current, [key]: value }));
  }

  function applyScrollRatio(from: HTMLElement, to: HTMLElement) {
    const fromRange = from.scrollHeight - from.clientHeight;
    const ratio = fromRange > 0 ? from.scrollTop / fromRange : 0;
    const toRange = to.scrollHeight - to.clientHeight;
    syncingRef.current = true;
    to.scrollTop = ratio * toRange;
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }

  const handleInputScroll = useCallback(
    (event: UIEvent<HTMLTextAreaElement>) => {
      if (!syncScroll || syncingRef.current || !outputTextareaRef.current) return;
      applyScrollRatio(event.currentTarget, outputTextareaRef.current);
    },
    [syncScroll],
  );

  const handleOutputScroll = useCallback(
    (event: UIEvent<HTMLTextAreaElement>) => {
      if (!syncScroll || syncingRef.current || !inputTextareaRef.current) return;
      applyScrollRatio(event.currentTarget, inputTextareaRef.current);
    },
    [syncScroll],
  );

  async function handleUpload(file: File) {
    setNotice(null);
    try {
      const text = await importTextFile(file);
      setSource(text);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be read.');
    }
  }

  async function handlePaste() {
    setNotice(null);
    try {
      const text = await navigator.clipboard.readText();
      setSource(text);
    } catch {
      setNotice('Clipboard access was blocked. Paste into the box instead with Ctrl+V.');
    }
  }

  async function copyMinified() {
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadMinified() {
    setNotice(null);
    try {
      const processor = await loadProcessor('developer.code-minifier');
      const output = await processor(
        { files: [], text: source, options: { ...minifyOptions, language: detectedId } },
        { signal: new AbortController().signal },
      );
      const artifact = output.artifacts[0];
      if (artifact) downloadBlob(artifact.blob, artifact.file_name);
    } catch {
      setNotice('That file could not be created.');
    }
  }

  const panelsGrid = (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:col-span-2 lg:grid-cols-2">
      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Input Code</p>
          <p className="text-muted text-xs">
            {inputLines} lines · {inputChars} characters
          </p>
        </div>
        <CodeEditorPanel
          value={source}
          onChange={setSource}
          hljs={hljs}
          hljsLanguage={language.hljs}
          highlightEnabled={syntaxHighlighting}
          onScroll={handleInputScroll}
          textareaRef={inputTextareaRef}
          placeholder={PLACEHOLDER}
          fillHeight={expanded}
        />
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Minified Code</p>
          <p className="text-muted text-xs">
            {outputLines} lines · {outputChars} characters
          </p>
        </div>
        <CodeEditorPanel
          value={outputText}
          hljs={hljs}
          hljsLanguage={language.hljs}
          highlightEnabled={syntaxHighlighting}
          onScroll={handleOutputScroll}
          readOnly
          textareaRef={outputTextareaRef}
          placeholder="The minified result will appear here."
          fillHeight={expanded}
        />
      </div>
    </div>
  );

  const mangleAvailable = language.engine === 'javascript' || language.engine === 'html';

  const optionsPanel = (
    <div className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-4">
      <div>
        <p className="text-sm font-semibold">Minify Options</p>
        <p className="text-muted text-xs">Choose how the minified code is produced.</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={syntaxHighlighting}
            onChange={(event) => setSyntaxHighlighting(event.target.checked)}
            className="accent-brand size-4"
          />
          Syntax highlighting
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={minifyOptions.removeComments}
            onChange={(event) => updateMinifyOption('removeComments', event.target.checked)}
            className="accent-brand size-4"
          />
          Remove comments
        </label>
        <label
          className={`flex items-start gap-2 text-sm ${mangleAvailable ? '' : 'text-muted opacity-60'}`}
        >
          <input
            type="checkbox"
            checked={minifyOptions.mangleNames && mangleAvailable}
            disabled={!mangleAvailable}
            onChange={(event) => updateMinifyOption('mangleNames', event.target.checked)}
            className="accent-brand mt-0.5 size-4 shrink-0"
          />
          <span className="min-w-0">
            Shorten variable names
            {!mangleAvailable && (
              <span className="text-muted mt-0.5 block text-xs">
                Only for JavaScript or HTML
              </span>
            )}
          </span>
        </label>
      </div>

      <StatGrid columns={2}>
        <StatTile icon={FileDown} label="Original size" value={formatBytes(originalBytes)} />
        <StatTile icon={FileDown} label="Minified size" value={formatBytes(minifiedBytes)} />
        <StatTile icon={FileDown} label="Bytes saved" value={formatBytes(savedBytes)} />
        <StatTile icon={FileDown} label="Reduction" value={`${savedPercent}%`} />
      </StatGrid>

      {notice && <Notice>{notice}</Notice>}

      {result?.minifyMode === 'failed' && (
        <Notice variant="info">
          This does not look like valid {language.label} yet, so nothing was minified. Fix the
          syntax and it will minify.
        </Notice>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={copyMinified}>
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={downloadMinified}>
          <Download aria-hidden className="size-4" />
          Download
        </Button>
      </div>
    </div>
  );

  const statusBar = !expanded && (
    <p className="text-muted flex flex-wrap items-center gap-3 text-xs">
      <span>
        Language {language.label}
        {isAuto && source !== '' ? ' (auto detected)' : isAuto ? ' (auto)' : ''}
      </span>
      {minifying ? (
        <span className="flex items-center gap-1">
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
          Minifying
        </span>
      ) : result?.minifyMode === 'full' && source !== '' ? (
        <span className="text-success flex items-center gap-1">
          <Check aria-hidden className="size-3.5" />
          Minified, {savedPercent}% smaller
        </span>
      ) : null}
    </p>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload aria-hidden className="size-4" />
              Upload file
            </Button>
            <Button variant="secondary" size="sm" onClick={handlePaste}>
              <Clipboard aria-hidden className="size-4" />
              Paste
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSource('')}
              disabled={source === ''}
            >
              <Trash2 aria-hidden className="size-4" />
              Clear
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={TEXT_IMPORT_ACCEPT}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void handleUpload(file);
              }}
            />
            <select
              value={languageId}
              onChange={(event) => setLanguageId(event.target.value)}
              className="border-border bg-background rounded-full border px-3 py-1.5 text-xs font-medium"
              aria-label="Language"
            >
              <option value="auto">Auto detect</option>
              {LANGUAGES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            <label className="border-border bg-background text-muted flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={syncScroll}
                onChange={(event) => setSyncScroll(event.target.checked)}
                className="accent-brand size-3.5"
              />
              Sync scroll
            </label>
          </div>

          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-success flex items-center gap-1 text-xs font-medium">
                <Check aria-hidden className="size-3.5" />
                Saved automatically
              </span>
            )}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="Expand editor"
              className="text-muted hover:text-foreground"
            >
              <Maximize2 aria-hidden className="size-4" />
            </button>
          </div>
        </div>

        {!expanded && panelsGrid}
        {statusBar}
      </div>

      <aside className="lg:sticky lg:top-20">{optionsPanel}</aside>

      {expanded &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Expanded code editor"
            className="bg-background/95 fixed inset-0 z-50 flex flex-col p-4 sm:p-8"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Code Minifier</p>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close expanded editor"
                className="text-muted hover:text-foreground"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4">{panelsGrid}</div>
          </div>,
          document.body,
        )}
    </div>
  );
}
