'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  GripVertical,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  Rewind,
  SkipBack,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { fileExtension, formatBytes, safeFileName, validateFiles } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { FileUpload } from '@/components/file_upload/file_upload';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number_field';
import { ControlPanel, Field, Notice, ProgressBar, SegmentedControl } from '@/components/video/control_panel';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { audioRule, AUDIO_ACCEPT, formatTime, readAudioMeta, type AudioMeta } from '@/lib/audio/audio_formats';
import { colorForIndex, resolveOutputSpec, type ClipColor, type JoinMode } from './formats';
import type { MergeAudioOptions } from './processor';

const RULE = audioRule({ max_files: 20 });
const MAX_CLIPS = 20;
const SKIP_SECONDS = 10;
const SEEK_EPSILON = 0.05;

const COLOR_CLASSES: Record<ClipColor, string> = {
  brand: 'bg-brand',
  success: 'bg-success',
  danger: 'bg-danger',
  ink: 'bg-ink',
};

const JOIN_MODE_OPTIONS: { value: JoinMode; label: string }[] = [
  { value: 'gap', label: 'Gap' },
  { value: 'crossfade', label: 'Crossfade' },
];

interface ClipItem {
  id: string;
  file: File;
  meta: AudioMeta | null;
  reading: boolean;
  volume: number;
  color: ClipColor;
}

interface TimelineEntry {
  clip: ClipItem;
  index: number;
  start: number;
  end: number;
  duration: number;
}

type DeckId = 'a' | 'b';

function otherDeck(id: DeckId): DeckId {
  return id === 'a' ? 'b' : 'a';
}

interface Result {
  artifact: ProcessorArtifact;
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

function ClipWaveform({ peaks, color }: { peaks: Float32Array; color: ClipColor }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const height = 36;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const styles = getComputedStyle(canvas);
    const fill = styles.getPropertyValue(`--color-${color === 'ink' ? 'cream' : 'on-brand'}`).trim() || '#fff';
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.85;
    const mid = height / 2;
    if (peaks.length > 0) {
      const barWidth = width / peaks.length;
      for (let i = 0; i < peaks.length; i += 1) {
        const barHeight = Math.max(1, (peaks[i] ?? 0) * (height - 6));
        ctx.fillRect(i * barWidth, mid - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
      }
    } else {
      ctx.fillRect(0, mid - 1, width, 2);
    }
  }, [peaks, width, color]);

  return <canvas ref={canvasRef} className="block w-full" />;
}

export function MergeAudioWorkspace() {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [joinMode, setJoinMode] = useState<JoinMode>('gap');
  const [joinSeconds, setJoinSeconds] = useState(1);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [overallTime, setOverallTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const abort = useRef<AbortController | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const clipUrlsRef = useRef(new Map<string, string>());
  // Two decks, so a crossfade can actually mix two clips at once: deck A plays the outgoing clip
  // while deck B plays the incoming one underneath it, each through its own GainNode, rather than
  // pretending to crossfade by just cutting from one clip's full playback to the next's.
  const audioARef = useRef<HTMLAudioElement>(null);
  const audioBRef = useRef<HTMLAudioElement>(null);
  const entryARef = useRef<TimelineEntry | null>(null);
  const entryBRef = useRef<TimelineEntry | null>(null);
  const gainARef = useRef<GainNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceCreated = useRef<{ a: boolean; b: boolean }>({ a: false, b: false });
  const primaryDeckRef = useRef<DeckId>('a');
  const listRef = useRef<HTMLDivElement>(null);
  const addFilesInputRef = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const gapTimer = useRef<number | null>(null);

  // Plain per-deck accessors rather than a `{ a: ref, b: ref }` lookup object: the lint rule
  // guarding against stray render-time mutation can't see through an indirect
  // `record[id].current = x` write, even though the underlying ref is perfectly stable.
  function audioFor(id: DeckId): HTMLAudioElement | null {
    return id === 'a' ? audioARef.current : audioBRef.current;
  }
  function entryFor(id: DeckId): TimelineEntry | null {
    return id === 'a' ? entryARef.current : entryBRef.current;
  }
  function setEntryFor(id: DeckId, value: TimelineEntry | null) {
    if (id === 'a') entryARef.current = value;
    else entryBRef.current = value;
  }
  function gainFor(id: DeckId): GainNode | null {
    return id === 'a' ? gainARef.current : gainBRef.current;
  }
  function setGainFor(id: DeckId, value: GainNode | null) {
    if (id === 'a') gainARef.current = value;
    else gainBRef.current = value;
  }

  const clipsRef = useRef<ClipItem[]>([]);
  const commit = useCallback((next: ClipItem[] | ((current: ClipItem[]) => ClipItem[])) => {
    const value = typeof next === 'function' ? next(clipsRef.current) : next;
    clipsRef.current = value;
    setClips(value);
  }, []);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (gapTimer.current) window.clearTimeout(gapTimer.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      for (const url of clipUrlsRef.current.values()) URL.revokeObjectURL(url);
      audioCtxRef.current?.close().catch(() => {
        // Nothing more to clean up if the context refuses to close.
      });
    },
    [],
  );

  // Wrapped in useCallback (not a plain function like its neighbors) purely so `reorder`'s own
  // useCallback below can depend on a stable reference — the underlying refs it reaches through
  // `audioFor`/`setEntryFor` never change identity across renders.
  const stopDeck = useCallback((id: DeckId) => {
    audioFor(id)?.pause();
    setEntryFor(id, null);
  }, []);

  function urlForClip(clip: ClipItem): string {
    const existing = clipUrlsRef.current.get(clip.id);
    if (existing) return existing;
    const url = URL.createObjectURL(clip.file);
    clipUrlsRef.current.set(clip.id, url);
    return url;
  }

  function clearResult() {
    setResult(null);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResultUrl(null);
  }

  const addFiles = useCallback(
    (files: File[]) => {
      clearResult();
      const check = validateFiles(files, { ...RULE, max_files: undefined });
      if (!check.ok) {
        setNotice(check.errors[0] ?? 'Those files could not be added.');
        return;
      }
      setNotice(null);

      const room = MAX_CLIPS - clipsRef.current.length;
      if (room <= 0) {
        setNotice(`You can merge at most ${MAX_CLIPS} files at a time.`);
        return;
      }
      const accepted = files.slice(0, room);
      if (files.length > room) {
        setNotice(`Only ${room} more file${room === 1 ? '' : 's'} fit; the limit is ${MAX_CLIPS}.`);
      }

      const items: ClipItem[] = accepted.map((file) => {
        sequence.current += 1;
        return {
          id: `clip-${sequence.current}`,
          file,
          meta: null,
          reading: true,
          volume: 100,
          color: colorForIndex(clipsRef.current.length + sequence.current),
        };
      });
      commit((current) => [...current, ...items]);

      void (async () => {
        for (const item of items) {
          try {
            const meta = await readAudioMeta(item.file);
            commit((current) =>
              current.map((entry) => (entry.id === item.id ? { ...entry, meta, reading: false } : entry)),
            );
          } catch {
            commit((current) =>
              current.map((entry) => (entry.id === item.id ? { ...entry, reading: false } : entry)),
            );
            setNotice(`${safeFileName(item.file.name)} could not be read as audio.`);
          }
        }
      })();
    },
    [commit],
  );

  function removeClip(id: string) {
    clearResult();
    const url = clipUrlsRef.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      clipUrlsRef.current.delete(id);
    }
    commit((current) => current.filter((clip) => clip.id !== id));
  }

  function clearAll() {
    clearResult();
    setNotice(null);
    stopDeck('a');
    stopDeck('b');
    if (gapTimer.current) {
      window.clearTimeout(gapTimer.current);
      gapTimer.current = null;
    }
    for (const url of clipUrlsRef.current.values()) URL.revokeObjectURL(url);
    clipUrlsRef.current.clear();
    commit([]);
    setOverallTime(0);
    setPlaying(false);
  }

  function setVolume(id: string, volume: number) {
    clearResult();
    commit((current) => current.map((clip) => (clip.id === id ? { ...clip, volume } : clip)));
  }

  const reorder = useCallback(
    (from: number, to: number) => {
      clearResult();
      stopDeck('a');
      stopDeck('b');
      setPlaying(false);
      commit((current) => move(current, from, to));
    },
    [commit, stopDeck],
  );

  const drag = useRef<{ id: string; x: number; y: number; node: HTMLElement } | null>(null);

  const endDrag = useCallback(() => {
    if (drag.current) drag.current.node.style.transform = '';
    drag.current = null;
    setDraggingId(null);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const state = drag.current;
      const list = listRef.current;
      if (!state || !list) return;
      state.node.style.transform = `translateY(${event.clientY - state.y}px)`;

      const rows = [...list.children].filter((child): child is HTMLElement =>
        child.hasAttribute('data-row'),
      );
      const from = rows.indexOf(state.node);
      const over = rows.findIndex((row) => {
        if (row === state.node) return false;
        const box = row.getBoundingClientRect();
        return event.clientY >= box.top && event.clientY <= box.bottom;
      });
      if (from !== -1 && over !== -1) {
        reorder(from, over);
        state.y = event.clientY;
        state.node.style.transform = '';
      }
    },
    [reorder],
  );

  useEffect(() => {
    if (!draggingId) return;
    const up = () => endDrag();
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [draggingId, onPointerMove, endDrag]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>, id: string) {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-no-drag]')) return;
    if (event.pointerType === 'touch' && !target.closest('[data-drag-handle]')) return;
    const node = event.currentTarget;
    event.preventDefault();
    drag.current = { id, x: event.clientX, y: event.clientY, node };
    setDraggingId(id);
  }

  const readyClips = clips.filter((clip) => clip.meta !== null);
  const stillReading = clips.some((clip) => clip.reading);
  const shortestDuration = readyClips.reduce(
    (min, clip) => Math.min(min, clip.meta?.duration ?? Infinity),
    Infinity,
  );
  const effectiveJoinSeconds =
    joinMode === 'crossfade' && Number.isFinite(shortestDuration)
      ? Math.min(joinSeconds, Math.max(0, shortestDuration * 0.9))
      : joinSeconds;
  const joinWasClamped = joinMode === 'crossfade' && effectiveJoinSeconds < joinSeconds - 0.01;

  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];
    let cursor = 0;
    clips.forEach((clip, index) => {
      const duration = clip.meta?.duration ?? 0;
      const start =
        index === 0 ? 0 : joinMode === 'gap' ? cursor + effectiveJoinSeconds : cursor - effectiveJoinSeconds;
      const end = start + duration;
      entries.push({ clip, index, start, end, duration });
      cursor = end;
    });
    const totalDuration = entries.length > 0 ? Math.max(...entries.map((entry) => entry.end)) : 0;
    return { entries, totalDuration };
  }, [clips, joinMode, effectiveJoinSeconds]);

  /** The entry that owns `time`. A click landing inside a gap (or crossfade overlap) maps
   *  forward to the clip that starts right after it, rather than falling back to the last clip
   *  in the list — the previous version's fallback made clicking anywhere in a gap jump to the
   *  final clip regardless of where the gap actually was. */
  function entryAt(time: number): TimelineEntry | null {
    for (const entry of timeline.entries) {
      if (time < entry.end) return entry;
    }
    return timeline.entries[timeline.entries.length - 1] ?? null;
  }

  // A `<MediaElementAudioSourceNode>` can only ever be created once per `<audio>` element, so
  // this graph is built lazily on first play (a user gesture is required to start an
  // AudioContext anyway) and reused for the rest of this session.
  function ensureAudioGraph(): AudioContext | null {
    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContextClass();
    const context = audioCtxRef.current;
    (['a', 'b'] as DeckId[]).forEach((id) => {
      if (sourceCreated.current[id]) return;
      const audio = audioFor(id);
      if (!audio) return;
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      source.connect(gain).connect(context.destination);
      setGainFor(id, gain);
      sourceCreated.current[id] = true;
    });
    return context;
  }

  function deckVolume(entry: TimelineEntry): number {
    return Math.max(0, Math.min(1, (entry.clip.volume / 100) * masterVolume));
  }


  function startDeck(id: DeckId, entry: TimelineEntry, localTime: number, gain: number) {
    const audio = audioFor(id);
    if (!audio || !entry.clip.meta) return;
    setEntryFor(id, entry);
    const url = urlForClip(entry.clip);
    if (audio.src !== url) audio.src = url;
    audio.currentTime = Math.max(0, localTime);
    const gainNode = gainFor(id);
    if (gainNode) gainNode.gain.value = Math.max(0, Math.min(1, gain));
    audio.play().catch(() => {
      // A rejection here means playback failed for a reason other than the user gesture.
    });
  }

  /** `forcedEntry` lets a caller that already knows exactly which clip it means (advancing to
   *  the next one, jumping to a specific clip) target it directly. In crossfade mode a clip's
   *  timeline start deliberately overlaps the tail of the one before it — `entryAt` resolves any
   *  time inside that overlap to the earlier clip, so deriving the entry from `next.start` alone
   *  would land back on the clip that just finished instead of advancing past it.
   *
   *  Always a "hard" seek: both decks reset to deck A playing this one clip solo. Crossfade
   *  blending is only ever entered by playing forward into an overlap (see `handleTimeUpdate`),
   *  never by seeking directly into the middle of one. */
  function playFrom(time: number, forcedEntry?: TimelineEntry) {
    const entry = forcedEntry ?? entryAt(time);
    if (!entry) return;
    ensureAudioGraph();
    audioCtxRef.current?.resume().catch(() => {
      // Resuming can fail before a user gesture reaches the browser; play() below still reports
      // the real failure if audio truly can't start.
    });
    if (gapTimer.current) {
      window.clearTimeout(gapTimer.current);
      gapTimer.current = null;
    }
    stopDeck('b');
    primaryDeckRef.current = 'a';
    startDeck('a', entry, time - entry.start, deckVolume(entry));
    setPlaying(true);
  }

  function togglePlay() {
    if (playing) {
      stopDeck('a');
      stopDeck('b');
      if (gapTimer.current) {
        window.clearTimeout(gapTimer.current);
        gapTimer.current = null;
      }
      setPlaying(false);
      return;
    }
    const from = overallTime >= timeline.totalDuration - SEEK_EPSILON ? 0 : overallTime;
    playFrom(from);
  }

  function seekTo(time: number) {
    const clamped = Math.max(0, Math.min(timeline.totalDuration, time));
    if (playing) playFrom(clamped);
    else setOverallTime(clamped);
  }

  function skip(delta: number) {
    seekTo(overallTime + delta);
  }

  function jumpClip(direction: 1 | -1) {
    const current = entryAt(overallTime);
    if (!current) return;
    const next = timeline.entries[current.index + direction];
    if (!next) {
      seekTo(direction === -1 ? 0 : timeline.totalDuration);
      return;
    }
    if (playing) playFrom(next.start, next);
    else setOverallTime(next.start);
  }

  // Ticks only for whichever deck is currently primary. Outside a crossfade overlap this just
  // tracks the playhead and keeps that deck's own gain live against the volume sliders; once the
  // primary clip enters its own final `effectiveJoinSeconds`, it starts the next clip on the
  // other deck at the matching offset and ramps both gains — an actual simultaneous blend, not a
  // sequential replay of the overlapping seconds from each clip in turn.
  function handleTimeUpdate(id: DeckId) {
    if (id !== primaryDeckRef.current) return;
    const audio = audioFor(id);
    const entry = entryFor(id);
    if (!audio || !entry) return;
    const time = entry.start + audio.currentTime;
    setOverallTime(time);

    const next = timeline.entries[entry.index + 1];
    const overlapStart = entry.end - effectiveJoinSeconds;
    const inOverlap = joinMode === 'crossfade' && effectiveJoinSeconds > 0 && !!next && time >= overlapStart;

    if (!inOverlap) {
      const gainNode = gainFor(id);
      if (gainNode) gainNode.gain.value = deckVolume(entry);
      return;
    }

    const secondary = otherDeck(id);
    if (next && entryFor(secondary)?.clip.id !== next.clip.id) {
      startDeck(secondary, next, time - next.start, 0);
    }
    const progress = Math.max(0, Math.min(1, (time - overlapStart) / effectiveJoinSeconds));
    const gainOut = gainFor(id);
    const gainIn = gainFor(secondary);
    if (gainOut) gainOut.gain.value = (1 - progress) * deckVolume(entry);
    if (gainIn && next) gainIn.gain.value = progress * deckVolume(next);
  }

  // A deck's own `ended` only matters when it's the primary — the secondary deck naturally
  // finishing shortly after being promoted away from is expected and needs no handling.
  function handleEnded(id: DeckId) {
    if (id !== primaryDeckRef.current) return;
    const entry = entryFor(id);
    if (!entry) {
      setPlaying(false);
      return;
    }
    const next = timeline.entries[entry.index + 1];
    if (!next) {
      setPlaying(false);
      stopDeck(otherDeck(id));
      return;
    }

    if (joinMode === 'crossfade' && effectiveJoinSeconds > 0) {
      const secondary = otherDeck(id);
      if (entryFor(secondary)?.clip.id === next.clip.id) {
        // The overlap already handed playback to the other deck; promote it to primary instead
        // of restarting it through `playFrom`, which would cut the audio right at the join.
        primaryDeckRef.current = secondary;
        const gainNode = gainFor(secondary);
        if (gainNode) gainNode.gain.value = deckVolume(next);
        setEntryFor(id, null);
        return;
      }
      playFrom(next.start, next);
      return;
    }

    if (joinMode === 'gap' && effectiveJoinSeconds > 0) {
      // The clip that just ended already paused the element natively, which reports `playing:
      // false` while this silent gap plays out — reflect that we're still mid playback so the
      // Pause button (and its own `clearTimeout` below) can still cancel this wait, and so this
      // isn't mistaken for a real, user initiated stop.
      setPlaying(true);
      gapTimer.current = window.setTimeout(() => {
        gapTimer.current = null;
        playFrom(next.start, next);
      }, effectiveJoinSeconds * 1000);
    } else {
      playFrom(next.start, next);
    }
  }

  const busy = progress !== null;
  const canRun = readyClips.length >= 2 && !stillReading && !busy;
  const percent = Math.round((progress?.ratio ?? 0) * 100);
  const totalBytes = clips.reduce((sum, clip) => sum + clip.file.size, 0);
  const outputSpec = resolveOutputSpec(clips.map((clip) => fileExtension(clip.file.name) || 'mp3'));

  const options: MergeAudioOptions = {
    clip_volumes: clips.map((clip) => clip.volume),
    join_mode: joinMode,
    join_seconds: effectiveJoinSeconds,
  };

  async function run() {
    if (!canRun) return;
    setNotice(null);
    clearResult();
    setPlaying(false);
    stopDeck('a');
    stopDeck('b');
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('audio.merge-audio');
      const output = await processor(
        { files: clips.map((clip) => clip.file), options: { ...options } },
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
        setNotice(error instanceof Error ? error.message : 'These files could not be merged.');
      }
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  return (
    <VideoWorkspaceLayout
      panelPosition="below"
      stage={
        clips.length === 0 ? (
          <div className="border-border bg-surface rounded-2xl border p-4">
            <FileUpload rule={RULE} multiple accept={AUDIO_ACCEPT} onFiles={addFiles} />
          </div>
        ) : (
          <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
            <audio
              ref={audioARef}
              className="hidden"
              onTimeUpdate={() => handleTimeUpdate('a')}
              onEnded={() => handleEnded('a')}
            />
            <audio
              ref={audioBRef}
              className="hidden"
              onTimeUpdate={() => handleTimeUpdate('b')}
              onEnded={() => handleEnded('b')}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => jumpClip(-1)}
                  disabled={busy}
                  aria-label="Previous clip"
                  className="size-9 rounded-full p-0"
                >
                  <SkipBack aria-hidden className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => skip(-SKIP_SECONDS)}
                  disabled={busy}
                  aria-label="Back 10 seconds"
                  className="size-9 rounded-full p-0"
                >
                  <Rewind aria-hidden className="size-4" />
                </Button>
                <Button
                  onClick={togglePlay}
                  disabled={busy || readyClips.length === 0}
                  aria-label={playing ? 'Pause' : 'Play'}
                  className="size-10 rounded-full p-0"
                >
                  {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4 translate-x-px" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => skip(SKIP_SECONDS)}
                  disabled={busy}
                  aria-label="Forward 10 seconds"
                  className="size-9 rounded-full p-0"
                >
                  <Rewind aria-hidden className="size-4 -scale-x-100" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => jumpClip(1)}
                  disabled={busy}
                  aria-label="Next clip"
                  className="size-9 rounded-full p-0"
                >
                  <SkipForward aria-hidden className="size-4" />
                </Button>
                <span className="text-muted text-sm tabular-nums">
                  {formatTime(overallTime)} / {formatTime(timeline.totalDuration)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted text-xs">Volume</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={masterVolume}
                  onChange={(event) => {
                    // Volume is applied through the GainNode graph, recomputed on every
                    // `timeupdate` tick against the latest `masterVolume` — no imperative nudge
                    // needed here, it takes effect on the next tick.
                    setMasterVolume(Number(event.target.value));
                  }}
                  aria-label="Master volume"
                  className="accent-brand w-28"
                />
              </div>
            </div>

            {timeline.totalDuration > 0 && (
              <div className="relative">
                <div
                  className="bg-ink text-cream pointer-events-none absolute -top-6 z-10 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{ left: `${(overallTime / timeline.totalDuration) * 100}%` }}
                >
                  {formatTime(overallTime)}
                </div>
                <div
                  className="border-border bg-cream/50 relative mt-6 overflow-hidden rounded-xl border"
                  style={{ height: 64 }}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                    playFrom(ratio * timeline.totalDuration);
                  }}
                >
                  {timeline.entries.map((entry) => {
                    const leftPercent = (entry.start / timeline.totalDuration) * 100;
                    const widthPercent = ((entry.end - entry.start) / timeline.totalDuration) * 100;
                    return (
                      <div
                        key={entry.clip.id}
                        className={`${COLOR_CLASSES[entry.clip.color]} absolute inset-y-0 flex flex-col justify-center overflow-hidden px-1 ${
                          joinMode === 'crossfade' ? 'opacity-90' : ''
                        }`}
                        style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, minWidth: 4 }}
                        title={safeFileName(entry.clip.file.name)}
                      >
                        {entry.clip.meta && <ClipWaveform peaks={entry.clip.meta.peaks} color={entry.clip.color} />}
                      </div>
                    );
                  })}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-black"
                    style={{ left: `${(overallTime / timeline.totalDuration) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div ref={listRef} className="flex flex-col gap-2">
              {clips.map((clip, index) => (
                <div
                  key={clip.id}
                  data-row
                  onPointerDown={(event) => startDrag(event, clip.id)}
                  className={`border-border bg-cream/30 flex touch-none items-center gap-3 rounded-xl border p-3 select-none ${
                    draggingId === clip.id ? 'z-10 opacity-90 shadow-lg' : ''
                  }`}
                  style={{ touchAction: draggingId === clip.id ? 'none' : undefined }}
                >
                  <button
                    type="button"
                    data-drag-handle
                    aria-label={`Reorder ${safeFileName(clip.file.name)}`}
                    className="text-muted hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                      event.preventDefault();
                      reorder(index, index + (event.key === 'ArrowUp' ? -1 : 1));
                    }}
                  >
                    <GripVertical aria-hidden className="size-4" />
                  </button>

                  <div className={`${COLOR_CLASSES[clip.color]} flex size-9 shrink-0 items-center justify-center rounded-full`}>
                    <Music aria-hidden className="text-on-brand size-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{safeFileName(clip.file.name)}</p>
                    <p className="text-muted text-xs">
                      {formatBytes(clip.file.size)}
                      {clip.reading && ' · Reading…'}
                      {!clip.reading && clip.meta && ` · ${formatTime(clip.meta.duration)}`}
                    </p>
                  </div>

                  <div className="hidden shrink-0 gap-4 text-xs sm:flex">
                    {timeline.entries[index] && (
                      <>
                        <span className="text-muted">
                          Start
                          <br />
                          <span className="text-foreground font-medium">{formatTime(timeline.entries[index].start)}</span>
                        </span>
                        <span className="text-muted">
                          End
                          <br />
                          <span className="text-foreground font-medium">{formatTime(timeline.entries[index].end)}</span>
                        </span>
                      </>
                    )}
                  </div>

                  <div data-no-drag className="flex w-28 shrink-0 items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={clip.volume}
                      onChange={(event) => setVolume(clip.id, Number(event.target.value))}
                      disabled={busy}
                      aria-label={`Volume for ${safeFileName(clip.file.name)}`}
                      className="accent-brand w-16"
                    />
                    <span className="text-muted w-8 text-right text-xs tabular-nums">{clip.volume}%</span>
                  </div>

                  <button
                    type="button"
                    data-no-drag
                    onClick={() => removeClip(clip.id)}
                    disabled={busy}
                    aria-label={`Remove ${safeFileName(clip.file.name)}`}
                    className="text-danger hover:text-danger/80 shrink-0"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            {result && resultUrl && (
              <div className="border-border bg-cream/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className="text-sm font-semibold">{result.artifact.file_name}</p>
                  <p className="text-muted text-xs">{formatBytes(result.artifact.blob.size)}</p>
                </div>
                <audio src={resultUrl} controls className="h-9 max-w-full" />
              </div>
            )}
          </div>
        )
      }
      panel={
        clips.length > 0 && (
          <ControlPanel>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <Field label="Join Type" hint="Applied to every join between clips.">
                <SegmentedControl options={JOIN_MODE_OPTIONS} value={joinMode} onChange={(value) => {
                  setJoinMode(value);
                  clearResult();
                }} disabled={busy} />
              </Field>

              <Field
                label={joinMode === 'gap' ? 'Gap Duration' : 'Crossfade Duration'}
                hint={joinWasClamped ? `Shortened to ${effectiveJoinSeconds.toFixed(1)}s for the shortest clip.` : undefined}
              >
                <div className="flex items-center gap-2">
                  <NumberField
                    value={joinSeconds}
                    onChange={(value) => {
                      setJoinSeconds(value);
                      clearResult();
                    }}
                    min={0}
                    max={30}
                    allowDecimal
                    disabled={busy}
                    aria-label="Join duration in seconds"
                    className="border-border bg-background h-10 w-full min-w-0 rounded-full border px-3 text-sm outline-none"
                  />
                  <span className="text-muted text-sm">s</span>
                </div>
              </Field>

              <Field label="Manage Files">
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => addFilesInputRef.current?.click()} disabled={busy}>
                    <Plus aria-hidden className="size-4" />
                    Add More Files
                  </Button>
                  <input
                    ref={addFilesInputRef}
                    type="file"
                    multiple
                    accept={AUDIO_ACCEPT}
                    className="sr-only"
                    onChange={(event) => {
                      addFiles(Array.from(event.target.files ?? []));
                      event.target.value = '';
                    }}
                  />
                  <Button variant="ghost" size="sm" onClick={clearAll} disabled={busy} className="text-danger">
                    <Trash2 aria-hidden className="size-4" />
                    Clear All
                  </Button>
                </div>
              </Field>
            </div>

            {notice && <Notice>{notice}</Notice>}
            {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

            <div className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <span>
                  <span className="text-muted block text-xs">Total Duration</span>
                  {formatTime(timeline.totalDuration)}
                </span>
                <span>
                  <span className="text-muted block text-xs">Total Files</span>
                  {clips.length}
                </span>
                <span>
                  <span className="text-muted block text-xs">Original Size</span>
                  {formatBytes(totalBytes)}
                </span>
                <span>
                  <span className="text-muted block text-xs">New Size</span>
                  {result ? formatBytes(result.artifact.blob.size) : 'Export to see'}
                </span>
                <span>
                  <span className="text-muted block text-xs">Output</span>
                  {outputSpec.extension.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {result && (
                  <Button
                    variant="secondary"
                    onClick={() => downloadBlob(result.artifact.blob, result.artifact.file_name)}
                  >
                    <Download aria-hidden className="size-4" />
                    Download
                  </Button>
                )}
                <Button onClick={run} disabled={!canRun} className="h-12 px-6 text-base">
                  {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
                  {busy ? `Merging ${percent}%` : 'Export Audio'}
                </Button>
              </div>
            </div>
          </ControlPanel>
        )
      }
    />
  );
}
