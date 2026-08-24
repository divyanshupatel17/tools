'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Download,
  EllipsisVertical,
  FolderOpen,
  Loader2,
  Maximize2,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  Scan,
  Scissors,
  Split,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { formatBytes, safeFileName } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { Notice, ProgressBar } from '@/components/video/control_panel';
import { Waveform } from '@/components/video/synced_video_pair';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { downloadBlob } from '@/lib/browser/download';
import { zipFiles } from '@/lib/browser/zip';
import { loadProcessor } from '@/lib/processing/processor_registry';
import {
  duplicateOrder,
  formatOrderedSegments,
  initialSegments,
  insertAfter,
  moveBoundary,
  nextOrderedIndexFrom,
  orderedIndexAt,
  reorderOutput,
  sequenceToSource,
  sourceToSequence,
  splitAt,
  syncOrder,
  toggleKeep,
  type Segment,
} from '@/lib/video/timeline';
import { probeVideo, type VideoProbe } from '@/lib/video/probe';
import { generateFilmstrip } from '@/lib/video/thumbnails';
import { formatDuration, readVideoMeta, VIDEO_ACCEPT, videoRule } from '@/lib/video/video_formats';
import type { TrimCutOutput } from './processor';
import { Timeline } from './timeline';

const THUMBNAIL_COUNT = 40;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

const RULE = videoRule();

interface SourceMeta {
  duration: number;
  width: number;
  height: number;
}

interface EditState {
  segments: Segment[];
  order: number[];
}

/** A minimal linear undo/redo stack for the segment/order edit state. */
function useEditHistory(initial: EditState) {
  const [stack, setStack] = useState<EditState[]>([initial]);
  const [index, setIndex] = useState(0);

  function commit(next: EditState) {
    setStack((current) => [...current.slice(0, index + 1), next]);
    setIndex((current) => current + 1);
  }

  function reset(next: EditState) {
    setStack([next]);
    setIndex(0);
  }

  return {
    state: stack[index] ?? initial,
    commit,
    reset,
    undo: () => setIndex((current) => Math.max(0, current - 1)),
    redo: () => setIndex((current) => Math.min(stack.length - 1, current + 1)),
    canUndo: index > 0,
    canRedo: index < stack.length - 1,
  };
}

function probeDetails(probe: VideoProbe | null): { label: string; value: string }[] {
  if (!probe) return [];
  const items: { label: string; value: string }[] = [];
  if (probe.width && probe.height) {
    items.push({ label: 'Resolution', value: `${probe.width}×${probe.height}` });
  }
  if (probe.video_codec) items.push({ label: 'Codec', value: probe.video_codec.toUpperCase() });
  if (probe.bitrate_kbps) items.push({ label: 'Bitrate', value: `${probe.bitrate_kbps} kbps` });
  return items;
}

interface ToolbarButtonProps {
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

/** One icon over label button in the fixed editing toolbar. */
function ToolbarButton({ label, icon: Icon, onClick, disabled, active }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex shrink-0 flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-30 ${
        active ? 'bg-brand/15 text-brand-strong' : 'text-muted hover:bg-cream hover:text-foreground'
      }`}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );
}

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Play or pause' },
  { keys: 'Delete', action: 'Remove selected cut' },
  { keys: 'Left / Right', action: 'Seek one second' },
  { keys: 'Ctrl + Z / Ctrl + Y', action: 'Undo / Redo' },
];

export function TrimCutVideoWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<SourceMeta | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  const history = useEditHistory({ segments: [], order: [] });
  const { segments, order } = history.state;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [runningMode, setRunningMode] = useState<TrimCutOutput | null>(null);
  const [mergeResult, setMergeResult] = useState<ProcessorArtifact | null>(null);
  const [mergeResultUrl, setMergeResultUrl] = useState<string | null>(null);
  const [splitResults, setSplitResults] = useState<ProcessorArtifact[] | null>(null);

  const [afterProbe, setAfterProbe] = useState<VideoProbe | null>(null);

  // The single player: shows the source while editing, swaps to the result once there is one.
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);

  const abort = useRef<AbortController | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const mergeResultUrlRef = useRef<string | null>(null);
  const afterProbeRequest = useRef(0);
  const thumbnailRequest = useRef(0);
  const dragIndexRef = useRef<number | null>(null);
  const openFileInputRef = useRef<HTMLInputElement>(null);
  /** Which ordered output clip is currently playing, so playback jumps across cuts and reorders. */
  const playIndexRef = useRef(0);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (mergeResultUrlRef.current) URL.revokeObjectURL(mergeResultUrlRef.current);
    },
    [],
  );

  const editing = mergeResult === null && splitResults === null;
  const previewUrl = mergeResult ? mergeResultUrl : sourceUrl;

  // Reload the player element whenever what it should show changes (new file, or a fresh
  // result to show "the edited video only").
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaying(false);
    setCurrentTime(0);
    setPlayerDuration(0);
  }, [previewUrl]);

  async function addFile(files: File[]) {
    const next = files[0];
    if (!next) return;

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (mergeResultUrlRef.current) URL.revokeObjectURL(mergeResultUrlRef.current);
    mergeResultUrlRef.current = null;

    setFile(next);
    setMergeResult(null);
    setMergeResultUrl(null);
    setSplitResults(null);
    setNotice(null);
    setMeta(null);
    setAfterProbe(null);
    setThumbnails([]);
    setZoom(1);

    const url = URL.createObjectURL(next);
    sourceUrlRef.current = url;
    setSourceUrl(url);

    try {
      const readMeta = await readVideoMeta(next);
      setMeta(readMeta);
      const seeded = initialSegments(readMeta.duration);
      history.reset({ segments: seeded, order: syncOrder(seeded, []) });
      setSelectedId(null);

      const thumbRequestId = (thumbnailRequest.current += 1);
      setLoadingThumbnails(true);
      try {
        const frames = await generateFilmstrip(next, readMeta.duration, THUMBNAIL_COUNT);
        if (thumbnailRequest.current === thumbRequestId) setThumbnails(frames);
      } catch {
        // The filmstrip is a visual aid, not required; the timeline still works without it.
      } finally {
        if (thumbnailRequest.current === thumbRequestId) setLoadingThumbnails(false);
      }
    } catch {
      setNotice('That file could not be read as a video.');
    }
  }

  function updateSegments(next: Segment[]) {
    history.commit({ segments: next, order: syncOrder(next, order) });
  }

  function updateOrder(next: number[]) {
    history.commit({ segments, order: next });
  }

  /**
   * Splits whichever segment contains `time`, keeping the new right hand piece next to its
   * sibling in the OUTPUT order — wherever that sibling currently sits after any reordering —
   * rather than `syncOrder`'s default of appending every newly kept id to the very end. Without
   * this, splitting a clip that's no longer in its original source position visibly scrambles
   * the sequence (e.g. output CD,AB, split CD, should give C,D,AB — not C,AB,D).
   */
  function performSplit(time: number) {
    const before = segments;
    const next = splitAt(before, time);
    if (next.length === before.length) return; // too close to an existing edge: a no-op
    const beforeIds = new Set(before.map((segment) => segment.id));
    const added = next.find((segment) => !beforeIds.has(segment.id));
    const baseOrder = syncOrder(next, order);
    if (!added || !added.keep) {
      history.commit({ segments: next, order: baseOrder });
      return;
    }
    const addedIndex = next.findIndex((segment) => segment.id === added.id);
    const leftSibling = next[addedIndex - 1];
    const finalOrder = leftSibling ? insertAfter(baseOrder, leftSibling.id, added.id) : baseOrder;
    history.commit({ segments: next, order: finalOrder });
  }

  const orderedSegments = useMemo(() => formatOrderedSegments(segments, order), [segments, order]);
  const keptCount = orderedSegments.length;
  const totalKeptSeconds = useMemo(
    () => orderedSegments.reduce((sum, segment) => sum + (segment.end - segment.start), 0),
    [orderedSegments],
  );
  // The preview's own transport (slider, time readout, arrow key nudge) always shows the edit's
  // own time line while editing — never the untouched source — so the player and the timeline
  // agree on what "the video" currently is.
  const sequencePosition = editing ? sourceToSequence(orderedSegments, currentTime) : null;

  const busy = progress !== null;
  const canRun = file !== null && !busy && keptCount > 0;
  const percent = Math.round((progress?.ratio ?? 0) * 100);

  const selected = segments.find((segment) => segment.id === selectedId) ?? null;
  const selectedIndex = selectedId !== null ? segments.findIndex((segment) => segment.id === selectedId) : -1;
  const selectedOrderIndex = selectedId !== null ? order.indexOf(selectedId) : -1;

  function selectAndClamp(id: number | null) {
    setSelectedId(id);
  }

  function cutSelected() {
    if (!selected || !selected.keep || busy) return;
    updateSegments(toggleKeep(segments, selected.id));
  }

  function splitSelected() {
    if (!selected || busy) return;
    const time = currentTime > selected.start && currentTime < selected.end
      ? currentTime
      : (selected.start + selected.end) / 2;
    performSplit(time);
  }

  /** Removes the clip from the output. Unlike a hard delete, its footage never gets silently
   *  absorbed back into a neighbouring clip — it just stops being part of the edit. */
  function deleteSelected() {
    if (!selected || busy) return;
    updateSegments(toggleKeep(segments, selected.id));
    setSelectedId(null);
  }

  function trimStart() {
    if (!selected || busy || selectedIndex <= 0) return;
    updateSegments(moveBoundary(segments, selectedIndex - 1, currentTime));
  }

  function trimEnd() {
    if (!selected || busy || selectedIndex === -1 || selectedIndex >= segments.length - 1) return;
    updateSegments(moveBoundary(segments, selectedIndex, currentTime));
  }

  function duplicateSelected() {
    if (!selected || !selected.keep || busy || selectedOrderIndex === -1) return;
    updateOrder(duplicateOrder(order, selectedOrderIndex));
  }

  function addCutAtPlayhead() {
    if (!file || busy) return;
    performSplit(currentTime);
  }

  function clearAllCuts() {
    if (!meta || busy) return;
    updateSegments(initialSegments(meta.duration));
    setSelectedId(null);
  }

  function removeCut(id: number) {
    if (busy) return;
    updateSegments(toggleKeep(segments, id));
    if (selectedId === id) setSelectedId(null);
  }

  /** Dragging a clip on the timeline itself to a new position in the output order. */
  function reorderOnTimeline(from: number, to: number) {
    if (busy) return;
    updateOrder(reorderOutput(order, from, to));
  }

  async function run(mode: TrimCutOutput) {
    if (!file || !canRun) return;
    setNotice(null);
    setMenuOpen(false);
    setMergeResult(null);
    if (mergeResultUrlRef.current) URL.revokeObjectURL(mergeResultUrlRef.current);
    mergeResultUrlRef.current = null;
    setMergeResultUrl(null);
    setSplitResults(null);
    setAfterProbe(null);
    afterProbeRequest.current += 1;
    setRunningMode(mode);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('video.trim-cut-video');
      const result = await processor(
        { files: [file], options: { output: mode, segments: orderedSegments } },
        { signal: controller.signal, on_progress: setProgress },
      );

      if (mode === 'split') {
        setSplitResults(result.artifacts);
      } else {
        const artifact = result.artifacts[0];
        if (artifact) {
          setMergeResult(artifact);
          const url = URL.createObjectURL(artifact.blob);
          mergeResultUrlRef.current = url;
          setMergeResultUrl(url);

          const requestId = (afterProbeRequest.current += 1);
          probeVideo(artifact.blob)
            .then((probe) => {
              if (afterProbeRequest.current === requestId) setAfterProbe(probe);
            })
            .catch(() => {});
        }
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice(
          error instanceof Error
            ? error.message
            : mode === 'split'
              ? 'This video could not be split.'
              : 'This video could not be cut.',
        );
      }
    } finally {
      abort.current = null;
      setProgress(null);
      setRunningMode(null);
    }
  }

  /** Back to editing the source, keeping the timeline exactly as it was left. */
  function editAgain() {
    if (mergeResultUrlRef.current) URL.revokeObjectURL(mergeResultUrlRef.current);
    mergeResultUrlRef.current = null;
    setMergeResult(null);
    setMergeResultUrl(null);
    setSplitResults(null);
    setAfterProbe(null);
    afterProbeRequest.current += 1;
  }

  function reset() {
    abort.current?.abort();
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (mergeResultUrlRef.current) URL.revokeObjectURL(mergeResultUrlRef.current);
    sourceUrlRef.current = null;
    mergeResultUrlRef.current = null;
    afterProbeRequest.current += 1;
    thumbnailRequest.current += 1;
    setFile(null);
    setMeta(null);
    setSourceUrl(null);
    history.reset({ segments: [], order: [] });
    setSelectedId(null);
    setThumbnails([]);
    setLoadingThumbnails(false);
    setMergeResult(null);
    setMergeResultUrl(null);
    setSplitResults(null);
    setAfterProbe(null);
    setNotice(null);
    setProgress(null);
    setRunningMode(null);
    setMenuOpen(false);
  }

  /** The output index whichever kept clip `time` falls in, or the next upcoming one if it's in a cut. */
  function resolvePlayIndex(time: number): number {
    const at = orderedIndexAt(orderedSegments, time);
    if (at !== -1) return at;
    return nextOrderedIndexFrom(orderedSegments, time);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (editing && orderedSegments.length > 0) {
        let index = resolvePlayIndex(video.currentTime);
        if (index === -1) index = 0; // past the last kept clip: restart the edit from its start
        playIndexRef.current = index;
        const segment = orderedSegments[index];
        if (segment && (video.currentTime < segment.start || video.currentTime >= segment.end)) {
          video.currentTime = segment.start;
          setCurrentTime(segment.start);
        }
      }
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  function seek(time: number) {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.min(Math.max(time, 0), playerDuration || time);
    video.currentTime = clamped;
    setCurrentTime(clamped);
    if (editing && orderedSegments.length > 0) {
      const index = resolvePlayIndex(clamped);
      if (index !== -1) playIndexRef.current = index;
    }
  }

  /** While playing the edit (not the raw source), jump from one kept clip straight to the next
   *  whenever playback reaches the end of the current one, following the current output order. */
  function onPlaybackTimeUpdate(time: number) {
    setCurrentTime(time);
    const video = videoRef.current;
    if (!video || video.paused || !editing || orderedSegments.length === 0) return;
    const segment = orderedSegments[playIndexRef.current];
    if (!segment || time < segment.end - 0.03) return;
    const nextIndex = playIndexRef.current + 1;
    const next = orderedSegments[nextIndex];
    if (next) {
      playIndexRef.current = nextIndex;
      video.currentTime = next.start;
    } else {
      video.pause();
    }
  }

  /** The clip that's playing can be the last chunk of the source file (its own end coinciding
   *  with the whole video's end), so the browser pauses on 'ended' before a timeupdate tick ever
   *  sees it reach the segment boundary. Handle that case here so the sequence keeps going. */
  function onPlaybackEnded() {
    const video = videoRef.current;
    if (!video || !editing || orderedSegments.length === 0) return;
    const next = orderedSegments[playIndexRef.current + 1];
    if (!next) return;
    playIndexRef.current += 1;
    video.currentTime = next.start;
    void video.play().catch(() => {});
  }

  // Global keyboard shortcuts, ignored while a person is typing into a text field.
  useEffect(() => {
    if (!file || !editing) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      if (event.key === ' ') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedId !== null) {
          event.preventDefault();
          deleteSelected();
        }
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const seq = sourceToSequence(orderedSegments, currentTime) ?? 0;
        seek(sequenceToSource(orderedSegments, Math.max(0, seq - 1)));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        const seq = sourceToSequence(orderedSegments, currentTime) ?? 0;
        seek(sequenceToSource(orderedSegments, Math.min(totalKeptSeconds, seq + 1)));
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
        setSelectedId(null);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        history.redo();
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, editing, selectedId, currentTime, playerDuration, segments, order]);

  const caption = mergeResult
    ? `${mergeResult.file_name} · ${formatBytes(mergeResult.blob.size)}`
    : file
      ? `${safeFileName(file.name)} · ${formatBytes(file.size)}${
          meta ? ` · ${formatDuration(meta.duration)} · ${meta.width}×${meta.height}` : ''
        }`
      : undefined;

  return (
    <VideoWorkspaceLayout
      panelPosition="below"
      stage={
        <div className="border-border bg-surface flex flex-col overflow-hidden rounded-2xl border shadow-sm">
          <input
            ref={openFileInputRef}
            type="file"
            accept={VIDEO_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const files = event.target.files ? Array.from(event.target.files) : [];
              event.target.value = '';
              if (files.length > 0) void addFile(files);
            }}
          />

          {/* Header: title, open file, export, and an overflow menu for the rest. */}
          <div className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="bg-brand text-on-brand flex size-9 items-center justify-center rounded-full">
                <Scissors aria-hidden className="size-4.5" />
              </span>
              <div className="leading-tight">
                <p className="text-foreground text-sm font-bold">Video cutter</p>
                <p className="text-muted text-xs">Trim, cut and reorder your video</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => openFileInputRef.current?.click()}>
                <FolderOpen aria-hidden className="size-3.5" />
                Open file
              </Button>
              {editing && (
                <Button size="sm" onClick={() => run('merge')} disabled={!canRun}>
                  {busy && runningMode === 'merge' ? (
                    <Loader2 aria-hidden className="size-3.5 animate-spin" />
                  ) : (
                    <Scissors aria-hidden className="size-3.5" />
                  )}
                  {busy && runningMode === 'merge' ? `Exporting ${percent}%` : 'Export video'}
                </Button>
              )}
              {mergeResult && (
                <Button size="sm" onClick={() => downloadBlob(mergeResult.blob, mergeResult.file_name)}>
                  <Download aria-hidden className="size-3.5" />
                  Download
                </Button>
              )}
              {file && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((value) => !value)}
                    aria-label="More options"
                    aria-expanded={menuOpen}
                    className="text-muted hover:text-foreground hover:bg-cream flex size-8 items-center justify-center rounded-full"
                  >
                    <EllipsisVertical aria-hidden className="size-4" />
                  </button>
                  {menuOpen && (
                    <>
                      <div
                        aria-hidden
                        className="fixed inset-0 z-10"
                        onClick={() => setMenuOpen(false)}
                      />
                      <div className="border-border bg-surface absolute top-full right-0 z-20 mt-1 w-56 rounded-xl border p-1 shadow-lg">
                        {editing && keptCount > 1 && (
                          <button
                            type="button"
                            onClick={() => run('split')}
                            disabled={!canRun}
                            className="hover:bg-cream flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-40"
                          >
                            <Download aria-hidden className="size-4" />
                            Export clips separately
                          </button>
                        )}
                        {!editing && (
                          <button
                            type="button"
                            onClick={() => {
                              editAgain();
                              setMenuOpen(false);
                            }}
                            className="hover:bg-cream flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"
                          >
                            <Pencil aria-hidden className="size-4" />
                            Edit again
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={reset}
                          disabled={busy}
                          className="hover:bg-cream flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-40"
                        >
                          <Trash2 aria-hidden className="size-4" />
                          Choose a different file
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {!file && (
            <div className="flex flex-col items-center gap-3 p-8">
              <div className="w-full max-w-md">
                <FileUpload rule={RULE} accept={VIDEO_ACCEPT} onFiles={addFile} />
              </div>
              <p className="text-muted text-xs">
                Drop a video above, or choose one. Nothing is uploaded; the whole thing runs in
                this browser tab.
              </p>
            </div>
          )}

          {file && (
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              {/* Preview + transport controls. */}
              <div className="flex flex-col gap-2">
                <div className="bg-ink/5 relative flex aspect-video max-h-[42vh] w-full items-center justify-center overflow-hidden rounded-xl">
                  {previewUrl && (
                    <>
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video
                        ref={videoRef}
                        src={previewUrl}
                        muted={muted}
                        className="size-full object-contain"
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onLoadedMetadata={(event) => setPlayerDuration(event.currentTarget.duration || 0)}
                        onTimeUpdate={(event) => onPlaybackTimeUpdate(event.currentTarget.currentTime)}
                        onEnded={onPlaybackEnded}
                      />
                      <button
                        type="button"
                        onClick={() => videoRef.current?.requestFullscreen?.()}
                        aria-label="View full screen"
                        title="Full screen"
                        className="bg-background/80 text-foreground absolute top-2 right-2 flex size-7 items-center justify-center rounded-full shadow-sm"
                      >
                        <Maximize2 aria-hidden className="size-3.5" />
                      </button>
                      {!editing && (
                        <div className="bg-background/90 text-foreground absolute top-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm">
                          Edited result
                        </div>
                      )}
                    </>
                  )}
                </div>

                {previewUrl && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={playing ? 'Pause' : 'Play'}
                      className="bg-brand text-on-brand hover:bg-brand-strong flex size-9 shrink-0 items-center justify-center rounded-full shadow-sm transition-colors"
                    >
                      {playing ? (
                        <Pause aria-hidden className="size-4" fill="currentColor" />
                      ) : (
                        <Play aria-hidden className="ml-0.5 size-4" fill="currentColor" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={editing ? totalKeptSeconds : playerDuration || 0}
                      step={0.01}
                      value={editing ? Math.min(sequencePosition ?? 0, totalKeptSeconds) : Math.min(currentTime, playerDuration || 0)}
                      aria-label="Position"
                      onChange={(event) =>
                        seek(
                          editing
                            ? sequenceToSource(orderedSegments, Number(event.target.value))
                            : Number(event.target.value),
                        )
                      }
                      className="accent-brand h-1.5 w-full"
                    />
                    <span className="text-muted w-16 shrink-0 text-right text-[11px] tabular-nums">
                      {editing
                        ? `${formatDuration(sequencePosition ?? 0)}/${formatDuration(totalKeptSeconds)}`
                        : `${formatDuration(currentTime)}/${formatDuration(playerDuration)}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMuted((value) => !value)}
                      aria-label={muted ? 'Unmute' : 'Mute'}
                      aria-pressed={muted}
                      className="text-muted hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-full transition-colors"
                    >
                      {muted ? (
                        <VolumeX aria-hidden className="size-3.5" />
                      ) : (
                        <Volume2 aria-hidden className="size-3.5" />
                      )}
                    </button>
                  </div>
                )}

                {/* eslint-disable-next-line react-hooks/refs */}
                {previewUrl && <Waveform videoEl={videoRef.current} playing={playing} />}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {caption && <p className="text-muted text-xs">{caption}</p>}
                  {!editing && mergeResult && probeDetails(afterProbe).length > 0 && (
                    <span className="text-muted flex flex-wrap gap-x-3 text-xs">
                      {probeDetails(afterProbe).map((detail) => (
                        <span key={detail.label}>
                          {detail.label}: <span className="font-semibold">{detail.value}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions + Cuts: everything a person edits with, stacked in the sidebar so the
                  video, the controls and the timeline all fit one screen without scrolling. */}
              {editing && meta && (
                <div className="flex min-h-0 flex-col gap-3">
                  <div className="border-border rounded-xl border p-2">
                    <p className="text-foreground px-1 pb-1.5 text-xs font-bold">Actions</p>
                    <div className="grid grid-cols-3 gap-0.5">
                      <ToolbarButton label="Cut" icon={Scissors} onClick={cutSelected} disabled={busy || !selected || !selected.keep} />
                      <ToolbarButton label="Split" icon={Split} onClick={splitSelected} disabled={busy || !selected} />
                      <ToolbarButton label="Delete" icon={Trash2} onClick={deleteSelected} disabled={busy || !selected} />
                      <ToolbarButton label="Undo" icon={Undo2} onClick={history.undo} disabled={busy || !history.canUndo} />
                      <ToolbarButton label="Redo" icon={Redo2} onClick={history.redo} disabled={busy || !history.canRedo} />
                      <ToolbarButton label="Add Cut" icon={Plus} onClick={addCutAtPlayhead} disabled={busy} />
                      <ToolbarButton label="Trim Start" icon={ChevronsLeft} onClick={trimStart} disabled={busy || !selected || selectedIndex <= 0} />
                      <ToolbarButton label="Trim End" icon={ChevronsRight} onClick={trimEnd} disabled={busy || !selected || selectedIndex === -1 || selectedIndex >= segments.length - 1} />
                      <ToolbarButton label="Duplicate" icon={Copy} onClick={duplicateSelected} disabled={busy || !selected || !selected.keep} />
                      <ToolbarButton label="Zoom In" icon={ZoomIn} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.5))} disabled={zoom >= MAX_ZOOM} />
                      <ToolbarButton label="Zoom Out" icon={ZoomOut} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.5))} disabled={zoom <= MIN_ZOOM} />
                      <ToolbarButton label="Fit Timeline" icon={Scan} onClick={() => setZoom(1)} disabled={zoom === MIN_ZOOM} />
                    </div>
                  </div>

                  <div className="border-border flex min-h-0 flex-col gap-2 rounded-xl border p-2.5">
                    <div className="flex items-center justify-between px-0.5">
                      <p className="text-foreground text-sm font-bold">Cuts ({keptCount})</p>
                      <button
                        type="button"
                        onClick={clearAllCuts}
                        disabled={busy || (segments.length === 1 && segments[0]?.keep === true)}
                        className="text-danger text-xs font-semibold hover:underline disabled:opacity-30"
                      >
                        Clear all
                      </button>
                    </div>
                    <ol className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                      {order.map((id, index) => {
                      const segment = segments.find((entry) => entry.id === id);
                      if (!segment) return null;
                      const thumbIndex =
                        thumbnails.length > 0 && meta.duration > 0
                          ? Math.min(
                              thumbnails.length - 1,
                              Math.round((segment.start / meta.duration) * (thumbnails.length - 1)),
                            )
                          : -1;
                      return (
                        <li
                          key={`${id}-${index}`}
                          draggable={!busy}
                          onDragStart={() => {
                            dragIndexRef.current = index;
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const from = dragIndexRef.current;
                            dragIndexRef.current = null;
                            if (from === null || from === index) return;
                            const next = [...order];
                            const [moved] = next.splice(from, 1);
                            if (moved === undefined) return;
                            next.splice(index, 0, moved);
                            updateOrder(next);
                          }}
                          onClick={() => selectAndClamp(id)}
                          className={`bg-cream flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                            selectedId === id ? 'border-brand ring-brand ring-1' : 'border-border'
                          }`}
                        >
                          <span className="bg-brand text-on-brand flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
                            {index + 1}
                          </span>
                          {thumbIndex >= 0 && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumbnails[thumbIndex]}
                              alt=""
                              draggable={false}
                              className="h-8 w-12 shrink-0 rounded object-cover"
                            />
                          )}
                          <span className="flex-1 leading-tight">
                            <span className="block">
                              {formatDuration(segment.start)}–{formatDuration(segment.end)}
                            </span>
                            <span className="text-muted">{formatDuration(segment.end - segment.start)}</span>
                          </span>
                          <span className="flex shrink-0 gap-0.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                removeCut(id);
                              }}
                              aria-label={`Delete cut ${index + 1}`}
                              title="Delete"
                              className="text-muted hover:text-danger flex size-6 items-center justify-center rounded-full disabled:opacity-30"
                            >
                              <Trash2 aria-hidden className="size-3.5" />
                            </button>
                          </span>
                        </li>
                      );
                    })}
                    {order.length === 0 && (
                      <li className="text-muted px-1 py-2 text-xs">No clips kept yet.</li>
                    )}
                  </ol>
                  </div>
                </div>
              )}
            </div>
          )}

          {editing && meta && (
            <div className="border-border/60 flex flex-col gap-3 border-t px-4 py-3">
              <Timeline
                duration={meta.duration}
                segments={segments}
                order={order}
                thumbnails={thumbnails}
                loadingThumbnails={loadingThumbnails}
                disabled={busy}
                currentTime={currentTime}
                onSeek={seek}
                selectedId={selectedId}
                onSelect={selectAndClamp}
                onMoveBoundary={(index, time) => updateSegments(moveBoundary(segments, index, time))}
                onReorder={reorderOnTimeline}
                zoom={zoom}
              />

              <Notice variant="info">
                Keeping {keptCount} segment{keptCount === 1 ? '' : 's'}, {formatDuration(totalKeptSeconds)}{' '}
                total out of {formatDuration(meta.duration)}.
              </Notice>
            </div>
          )}

          {notice && (
            <div className="px-4 pt-3">
              <Notice>{notice}</Notice>
            </div>
          )}

          {busy && (
            <div className="px-4 pt-3">
              <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />
            </div>
          )}

          {splitResults && splitResults.length > 0 && (
            <div className="flex flex-col gap-2 px-4 py-4">
              <p className="text-muted text-xs">
                Split into {splitResults.length} file{splitResults.length === 1 ? '' : 's'}:
              </p>
              {splitResults.map((artifact) => (
                <div
                  key={artifact.file_name}
                  className="border-border bg-cream flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                >
                  <span className="truncate">
                    {artifact.file_name} · {formatBytes(artifact.blob.size)}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => downloadBlob(artifact.blob, artifact.file_name)}
                  >
                    <Download aria-hidden className="size-3.5" />
                  </Button>
                </div>
              ))}
              {splitResults.length > 1 && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={async () => {
                    const zip = await zipFiles(
                      await Promise.all(
                        splitResults.map(async (artifact) => ({
                          file_name: artifact.file_name,
                          bytes: new Uint8Array(await artifact.blob.arrayBuffer()),
                        })),
                      ),
                    );
                    downloadBlob(zip, 'segments.zip');
                  }}
                >
                  <Download aria-hidden className="size-4" />
                  Download all (zip)
                </Button>
              )}
            </div>
          )}

          {editing && meta && (
            <div className="border-border/60 flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <dl className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                {SHORTCUTS.map((shortcut) => (
                  <div key={shortcut.keys} className="flex items-center gap-1.5">
                    <dt className="border-border bg-cream rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                      {shortcut.keys}
                    </dt>
                    <dd>{shortcut.action}</dd>
                  </div>
                ))}
              </dl>
              <p className="bg-cream text-ink/80 rounded-lg px-3 py-1.5 text-[11px]">
                Tip: drag the cut markers, or a clip in Cuts, to trim and rearrange your video.
              </p>
            </div>
          )}
        </div>
      }
    />
  );
}
