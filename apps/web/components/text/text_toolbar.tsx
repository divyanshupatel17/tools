'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Clipboard,
  FileText,
  FolderOpen,
  Loader2,
  Maximize2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Notice } from '@/components/text/control_panel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { importTextFile, TEXT_IMPORT_ACCEPT } from '@/lib/text/file_import';

interface FileSystemFileHandleLike {
  getFile: () => Promise<File>;
}
type ShowOpenFilePicker = (options?: {
  multiple?: boolean;
}) => Promise<FileSystemFileHandleLike[]>;

export function countWordsAndCharacters(text: string): { words: number; characters: number } {
  const trimmed = text.trim();
  return {
    words: trimmed === '' ? 0 : trimmed.split(/\s+/).length,
    characters: text.length,
  };
}

/** The small "N words · N characters" line every Text tool shows under its own textarea. */
export function TextFooterCount({ value }: { value: string }) {
  const counts = countWordsAndCharacters(value);
  return (
    <p className="text-muted mt-2 flex items-center gap-1.5 text-xs">
      <FileText aria-hidden className="size-3.5" />
      {counts.words.toLocaleString()} words · {counts.characters.toLocaleString()} characters
    </p>
  );
}

export interface TextToolbarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  /** Persists `value` to localStorage under this key, restored on the next visit. Omit to
   * disable autosave for a tool that should not remember what was typed. */
  autosaveKey?: string;
  /** Label above the editable pane in the fullscreen editor. Defaults to "Input". */
  inputLabel?: string;
  /** The tool's own result view — a read only textarea, a stat grid, a table — rendered in the
   * right pane of the fullscreen editor so expanding never leaves the output behind. Omit only
   * for a tool with no derived result to show. */
  expandedOutput?: ReactNode;
  /** Label above `expandedOutput` in the fullscreen editor. Defaults to "Result". */
  expandedOutputLabel?: string;
}

/** Upload, Open, Paste, Clear, the Auto-saved indicator and the expand-to-fullscreen editor —
 * the toolbar shared by every Text tool that accepts typed or pasted input. Renders above
 * whichever textarea the caller places below it; a tool with two textareas (e.g. Case
 * Converter's input and converted panels) mounts this once, against its source text only.
 * Expanding always shows the editable input beside `expandedOutput`, never the input alone —
 * see the AGENTS.md rule this component exists to satisfy. */
export function TextToolbar({
  value,
  onChange,
  placeholder,
  disabled,
  autosaveKey,
  inputLabel = 'Input',
  expandedOutput,
  expandedOutputLabel = 'Result',
}: TextToolbarProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const restored = useRef(false);

  // Restored once on mount, before anything the user types could be overwritten.
  useEffect(() => {
    if (!autosaveKey || restored.current) return;
    restored.current = true;
    const draft = window.localStorage.getItem(`text-tool:${autosaveKey}`);
    if (draft && value === '') onChange(draft);
  }, [autosaveKey, onChange, value]);

  // A side effect on an external store (localStorage), not React state — `saved` below is
  // derived straight from `value` for display, so this never calls setState itself.
  useEffect(() => {
    if (!autosaveKey || !restored.current) return;
    if (value === '') {
      window.localStorage.removeItem(`text-tool:${autosaveKey}`);
      return;
    }
    window.localStorage.setItem(`text-tool:${autosaveKey}`, value);
  }, [autosaveKey, value]);

  const saved = Boolean(autosaveKey) && value !== '';

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  async function importFile(file: File) {
    setNotice(null);
    setImporting(true);
    try {
      const text = await importTextFile(file);
      onChange(text);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That file could not be read.');
    } finally {
      setImporting(false);
    }
  }

  async function openWithSystemPicker() {
    const picker = (window as unknown as { showOpenFilePicker?: ShowOpenFilePicker })
      .showOpenFilePicker;
    if (!picker) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const [handle] = await picker({ multiple: false });
      if (handle) await importFile(await handle.getFile());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setNotice('That file could not be opened.');
    }
  }

  async function pasteFromClipboard() {
    setNotice(null);
    try {
      const text = await navigator.clipboard.readText();
      onChange(text);
    } catch {
      setNotice('Clipboard access was blocked. Paste into the box instead with Ctrl+V.');
    }
  }

  const busy = disabled || importing;
  const counts = countWordsAndCharacters(value);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            {importing ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Upload aria-hidden className="size-4" />
            )}
            Upload File
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={openWithSystemPicker}
            disabled={busy}
          >
            <FolderOpen aria-hidden className="size-4" />
            Open
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={pasteFromClipboard}
            disabled={busy}
          >
            <Clipboard aria-hidden className="size-4" />
            Paste
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onChange('')}
            disabled={busy || value === ''}
          >
            <Trash2 aria-hidden className="size-4" />
            Clear
          </Button>
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept={TEXT_IMPORT_ACCEPT}
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importFile(file);
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-success flex items-center gap-1 text-xs font-medium">
              <Check aria-hidden className="size-3.5" />
              Auto-saved
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

      {notice && (
        <div className="mb-3">
          <Notice>{notice}</Notice>
        </div>
      )}

      {expanded &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Expanded text editor"
            className="bg-background/95 fixed inset-0 z-50 flex flex-col p-4 sm:p-8"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-muted flex items-center gap-1.5 text-sm">
                <FileText aria-hidden className="size-4" />
                {counts.words.toLocaleString()} words · {counts.characters.toLocaleString()}{' '}
                characters
              </p>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close expanded editor"
                className="text-muted hover:text-foreground"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            {expandedOutput ? (
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex min-h-0 flex-col">
                  <p className="mb-2 text-sm font-semibold">{inputLabel}</p>
                  <Textarea
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoFocus
                    className="font-mono min-h-0 flex-1 resize-none"
                  />
                </div>
                <div className="flex min-h-0 flex-col overflow-y-auto">
                  <p className="mb-2 text-sm font-semibold">{expandedOutputLabel}</p>
                  {expandedOutput}
                </div>
              </div>
            ) : (
              <Textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                autoFocus
                className="font-mono min-h-0 flex-1 resize-none"
              />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
