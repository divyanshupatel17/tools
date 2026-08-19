'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Check,
  Download,
  FileText,
  Gauge,
  Headphones,
  ImagePlus,
  Loader2,
  Music,
  Pencil,
  Radio,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { fileExtension, formatBytes, safeFileName } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { Notice, ProgressBar } from '@/components/video/control_panel';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { audioRule, AUDIO_ACCEPT, formatTime, readAudioMeta, type AudioMeta } from '@/lib/audio/audio_formats';
import { EMPTY_TAGS, extractArtwork, probeAudioTags, type AudioProbe, type AudioTagFields } from './id3';
import type { ArtworkAction, AudioMetadataOptions } from './processor';

const RULE = audioRule();

interface Result {
  artifact: ProcessorArtifact;
}

interface Snapshot {
  fields: AudioTagFields;
  artworkAction: ArtworkAction;
  newArtworkFile: File | null;
  newArtworkUrl: string | null;
}

const FIELD_CLASS =
  'border-border bg-background w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-50';

export function AudioMetadataEditorWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [meta, setMeta] = useState<AudioMeta | null>(null);
  const [probe, setProbe] = useState<AudioProbe | null>(null);
  const [reading, setReading] = useState(false);

  const [fields, setFields] = useState<AudioTagFields>(EMPTY_TAGS);
  const [artworkAction, setArtworkAction] = useState<ArtworkAction>('keep');
  const [originalArtworkUrl, setOriginalArtworkUrl] = useState<string | null>(null);
  const [newArtworkFile, setNewArtworkFile] = useState<File | null>(null);
  const [newArtworkUrl, setNewArtworkUrl] = useState<string | null>(null);

  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const abort = useRef<AbortController | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const originalArtworkUrlRef = useRef<string | null>(null);
  const newArtworkUrlRef = useRef<string | null>(null);
  const artworkInputRef = useRef<HTMLInputElement>(null);
  const focusSnapshotRef = useRef<Snapshot | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      if (originalArtworkUrlRef.current) URL.revokeObjectURL(originalArtworkUrlRef.current);
      if (newArtworkUrlRef.current) URL.revokeObjectURL(newArtworkUrlRef.current);
    },
    [],
  );

  function clearResult() {
    setResult(null);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResultUrl(null);
  }

  function currentSnapshot(): Snapshot {
    return { fields, artworkAction, newArtworkFile, newArtworkUrl };
  }

  function applySnapshot(snapshot: Snapshot) {
    setFields(snapshot.fields);
    setArtworkAction(snapshot.artworkAction);
    setNewArtworkFile(snapshot.newArtworkFile);
    setNewArtworkUrl(snapshot.newArtworkUrl);
  }

  function pushHistory(before: Snapshot) {
    setPast((prev) => [...prev, before]);
    setFuture([]);
  }

  function undo() {
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast((prev) => prev.slice(0, -1));
    setFuture((prev) => [currentSnapshot(), ...prev]);
    applySnapshot(previous);
    clearResult();
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture((prev) => prev.slice(1));
    setPast((prev) => [...prev, currentSnapshot()]);
    applySnapshot(next);
    clearResult();
  }

  function handleFieldFocus() {
    focusSnapshotRef.current = currentSnapshot();
  }

  function handleFieldBlur() {
    const before = focusSnapshotRef.current;
    focusSnapshotRef.current = null;
    if (!before) return;
    if (JSON.stringify(before.fields) !== JSON.stringify(fields)) pushHistory(before);
  }

  function updateField<K extends keyof AudioTagFields>(key: K, value: AudioTagFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
    clearResult();
  }

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;

    clearResult();
    if (originalArtworkUrlRef.current) URL.revokeObjectURL(originalArtworkUrlRef.current);
    if (newArtworkUrlRef.current) URL.revokeObjectURL(newArtworkUrlRef.current);
    originalArtworkUrlRef.current = null;
    newArtworkUrlRef.current = null;

    setFile(next);
    setCustomName(null);
    setNotice(null);
    setMeta(null);
    setProbe(null);
    setFields(EMPTY_TAGS);
    setArtworkAction('keep');
    setOriginalArtworkUrl(null);
    setNewArtworkFile(null);
    setNewArtworkUrl(null);
    setPast([]);
    setFuture([]);

    setReading(true);
    try {
      const [readMeta, readProbe] = await Promise.all([readAudioMeta(next), probeAudioTags(next)]);
      setMeta(readMeta);
      setProbe(readProbe);
      setFields(readProbe.tags);

      if (readProbe.artwork_stream_index !== null) {
        const artwork = await extractArtwork(next, readProbe.artwork_stream_index, readProbe.artwork_codec);
        if (artwork) {
          const url = URL.createObjectURL(artwork);
          originalArtworkUrlRef.current = url;
          setOriginalArtworkUrl(url);
        }
      }
    } catch {
      setNotice('That file could not be read as audio.');
    } finally {
      setReading(false);
    }
  }

  function reset() {
    abort.current?.abort();
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    if (originalArtworkUrlRef.current) URL.revokeObjectURL(originalArtworkUrlRef.current);
    if (newArtworkUrlRef.current) URL.revokeObjectURL(newArtworkUrlRef.current);
    resultUrlRef.current = null;
    originalArtworkUrlRef.current = null;
    newArtworkUrlRef.current = null;
    setFile(null);
    setCustomName(null);
    setEditingName(false);
    setMeta(null);
    setProbe(null);
    setFields(EMPTY_TAGS);
    setArtworkAction('keep');
    setOriginalArtworkUrl(null);
    setNewArtworkFile(null);
    setNewArtworkUrl(null);
    setPast([]);
    setFuture([]);
    setResult(null);
    setResultUrl(null);
    setNotice(null);
    setProgress(null);
  }

  function handleArtworkUpload(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    pushHistory(currentSnapshot());
    if (newArtworkUrlRef.current) URL.revokeObjectURL(newArtworkUrlRef.current);
    const url = URL.createObjectURL(picked);
    newArtworkUrlRef.current = url;
    setNewArtworkFile(picked);
    setNewArtworkUrl(url);
    setArtworkAction('replace');
    clearResult();
  }

  function removeArtwork() {
    pushHistory(currentSnapshot());
    if (newArtworkUrlRef.current) URL.revokeObjectURL(newArtworkUrlRef.current);
    newArtworkUrlRef.current = null;
    setNewArtworkFile(null);
    setNewArtworkUrl(null);
    setArtworkAction('remove');
    clearResult();
  }

  const busy = progress !== null;
  const duration = meta?.duration ?? 0;
  const extension = file ? fileExtension(file.name) || 'mp3' : 'mp3';
  const displayName = customName ?? (file ? safeFileName(file.name) : '');
  const canRun = file !== null && meta !== null && probe !== null && !busy;

  const displayedArtworkUrl =
    artworkAction === 'replace' ? newArtworkUrl : artworkAction === 'remove' ? null : originalArtworkUrl;
  const hasArtwork = displayedArtworkUrl !== null;

  const bitrateKbps =
    probe?.bitrate_kbps ?? (file && duration > 0 ? Math.round((file.size * 8) / duration / 1000) : null);

  const options: AudioMetadataOptions = { ...fields, artwork_action: artworkAction };

  async function run() {
    if (!file || !canRun) return;
    setNotice(null);
    clearResult();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('audio.audio-metadata-editor');
      const inputFiles = artworkAction === 'replace' && newArtworkFile ? [file, newArtworkFile] : [file];
      const output = await processor(
        { files: inputFiles, options: { ...options } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setResult({ artifact });
        const url = URL.createObjectURL(artifact.blob);
        resultUrlRef.current = url;
        setResultUrl(url);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice(error instanceof Error ? error.message : 'This file could not be processed.');
      }
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  const fieldProps = {
    onFocus: handleFieldFocus,
    onBlur: handleFieldBlur,
  };

  return (
    <VideoWorkspaceLayout
      panelPosition="below"
      stage={
        !file ? (
          <div className="border-border bg-surface rounded-2xl border p-4">
            <FileUpload rule={RULE} accept={AUDIO_ACCEPT} onFiles={addFile} />
          </div>
        ) : (
          <div className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-brand text-on-brand flex size-11 shrink-0 items-center justify-center rounded-full">
                  <Music aria-hidden className="size-5" />
                </div>
                <div>
                  {editingName ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        autoFocus
                        className="border-border bg-background h-8 rounded-md border px-2 text-sm font-semibold outline-none"
                        aria-label="File name"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCustomName(nameDraft.trim() || displayName);
                          setEditingName(false);
                        }}
                        aria-label="Save name"
                        className="text-brand hover:text-brand-strong"
                      >
                        <Check aria-hidden className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{displayName}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setNameDraft(displayName);
                          setEditingName(true);
                        }}
                        aria-label="Rename file"
                        className="text-muted hover:text-foreground"
                      >
                        <Pencil aria-hidden className="size-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="text-muted text-xs">
                    {formatBytes(file.size)}
                    {reading && ' · Reading…'}
                    {!reading && duration > 0 && ` · ${formatTime(duration).slice(0, 5)}`}
                    {!reading && bitrateKbps && ` · ${bitrateKbps} kbps`}
                    {!reading && ` · ${extension.toUpperCase()}`}
                    {!reading && meta?.sample_rate && ` · ${(meta.sample_rate / 1000).toFixed(1)} kHz`}
                    {!reading && meta?.channels && ` · ${meta.channels === 1 ? 'Mono' : 'Stereo'}`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="ghost" size="sm" onClick={undo} disabled={past.length === 0}>
                  <Undo2 aria-hidden className="size-4" />
                  Undo
                </Button>
                <Button variant="ghost" size="sm" onClick={redo} disabled={future.length === 0}>
                  <Redo2 aria-hidden className="size-4" />
                  Redo
                </Button>
                <Button variant="ghost" size="sm" onClick={reset} className="text-danger">
                  <Trash2 aria-hidden className="size-4" />
                  Remove
                </Button>
              </div>
            </div>

            {reading ? (
              <div className="bg-cream/50 h-[280px] animate-pulse rounded-xl" />
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="flex flex-col gap-4 lg:col-span-2">
                  <p className="font-semibold">Edit Metadata</p>
                  <label className="text-sm">
                    <span className="text-muted mb-1 block text-xs font-semibold">Title</span>
                    <input
                      value={fields.title}
                      onChange={(event) => updateField('title', event.target.value)}
                      disabled={busy}
                      className={FIELD_CLASS}
                      {...fieldProps}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-muted mb-1 block text-xs font-semibold">Artist</span>
                    <input
                      value={fields.artist}
                      onChange={(event) => updateField('artist', event.target.value)}
                      disabled={busy}
                      className={FIELD_CLASS}
                      {...fieldProps}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-muted mb-1 block text-xs font-semibold">Album</span>
                    <input
                      value={fields.album}
                      onChange={(event) => updateField('album', event.target.value)}
                      disabled={busy}
                      className={FIELD_CLASS}
                      {...fieldProps}
                    />
                  </label>

                  <div className="grid grid-cols-3 gap-3">
                    <label className="text-sm">
                      <span className="text-muted mb-1 block text-xs font-semibold">Genre</span>
                      <input
                        value={fields.genre}
                        onChange={(event) => updateField('genre', event.target.value)}
                        disabled={busy}
                        className={FIELD_CLASS}
                        {...fieldProps}
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-muted mb-1 block text-xs font-semibold">Year</span>
                      <input
                        value={fields.year}
                        onChange={(event) => updateField('year', event.target.value)}
                        disabled={busy}
                        className={FIELD_CLASS}
                        {...fieldProps}
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-muted mb-1 block text-xs font-semibold">Track Number</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          value={fields.track}
                          onChange={(event) => updateField('track', event.target.value)}
                          disabled={busy}
                          className={FIELD_CLASS}
                          {...fieldProps}
                        />
                        <span className="text-muted text-xs">of</span>
                        <input
                          value={fields.track_total}
                          onChange={(event) => updateField('track_total', event.target.value)}
                          disabled={busy}
                          className={FIELD_CLASS}
                          {...fieldProps}
                        />
                      </div>
                    </label>
                  </div>

                  <label className="text-sm">
                    <span className="text-muted mb-1 block text-xs font-semibold">Comment</span>
                    <textarea
                      value={fields.comment}
                      onChange={(event) => updateField('comment', event.target.value)}
                      disabled={busy}
                      rows={2}
                      className={FIELD_CLASS}
                      {...fieldProps}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">
                      <span className="text-muted mb-1 block text-xs font-semibold">Composer</span>
                      <input
                        value={fields.composer}
                        onChange={(event) => updateField('composer', event.target.value)}
                        disabled={busy}
                        className={FIELD_CLASS}
                        {...fieldProps}
                      />
                    </label>
                    <label className="text-sm">
                      <span className="text-muted mb-1 block text-xs font-semibold">Copyright</span>
                      <input
                        value={fields.copyright}
                        onChange={(event) => updateField('copyright', event.target.value)}
                        disabled={busy}
                        className={FIELD_CLASS}
                        {...fieldProps}
                      />
                    </label>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <p className="font-semibold">Artwork</p>
                  <div className="border-border bg-cream/40 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border">
                    {hasArtwork && displayedArtworkUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={displayedArtworkUrl} alt="Album artwork" className="size-full object-cover" />
                    ) : (
                      <Music aria-hidden className="text-muted size-10" />
                    )}
                  </div>
                  <input
                    ref={artworkInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleArtworkUpload}
                    className="hidden"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => artworkInputRef.current?.click()}
                    disabled={busy}
                  >
                    <ImagePlus aria-hidden className="size-4" />
                    Upload Artwork
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={removeArtwork}
                    disabled={busy || !hasArtwork}
                    className="text-danger"
                  >
                    <Trash2 aria-hidden className="size-4" />
                    Remove Artwork
                  </Button>
                  <p className="text-muted text-center text-xs">Recommended: 1000x1000 px (JPG, PNG)</p>
                </div>
              </div>
            )}

            {!reading && meta && probe && (
              <div className="border-border bg-cream/30 grid grid-cols-2 gap-3 rounded-xl border p-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
                <div className="flex items-center gap-2">
                  <Music aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">Original Format</span>
                    <span className="font-semibold">{extension.toUpperCase()}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">Duration</span>
                    <span className="font-semibold">{formatTime(duration).slice(0, 5)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Radio aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">Bitrate</span>
                    <span className="font-semibold">{bitrateKbps ? `${bitrateKbps} kbps` : 'Unknown'}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Gauge aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">Sample Rate</span>
                    <span className="font-semibold">
                      {meta.sample_rate ? `${(meta.sample_rate / 1000).toFixed(1)} kHz` : 'Unknown'}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Headphones aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">Channels</span>
                    <span className="font-semibold">{meta.channels === 1 ? 'Mono' : 'Stereo'}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText aria-hidden className="text-muted size-4 shrink-0" />
                  <span>
                    <span className="text-muted block">Size</span>
                    <span className="font-semibold">{formatBytes(file.size)}</span>
                  </span>
                </div>
              </div>
            )}

            {notice && <Notice>{notice}</Notice>}
            {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

            <div className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <Notice variant="info">
                Only metadata will be modified. Audio quality and file format remain the same.
              </Notice>

              {result && resultUrl ? (
                <Button
                  onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}
                  className="h-12 shrink-0 px-6 text-base"
                >
                  <Download aria-hidden className="size-4" />
                  Download Updated Audio
                </Button>
              ) : (
                <Button onClick={run} disabled={!canRun} className="h-12 shrink-0 px-6 text-base">
                  {busy ? (
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <Download aria-hidden className="size-4" />
                  )}
                  {busy ? `Exporting ${Math.round((progress?.ratio ?? 0) * 100)}%` : 'Export Updated Audio'}
                </Button>
              )}
            </div>
          </div>
        )
      }
    />
  );
}
