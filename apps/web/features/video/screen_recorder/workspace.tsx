'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Circle,
  Download,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  Square,
} from 'lucide-react';
import { formatBytes } from '@tools/file_utils';
import type { ProcessorProgress } from '@tools/tool_engine';
import { Field, Notice, ProgressBar, SliderField } from '@/components/video/control_panel';
import { RangeTrim } from '@/components/video/range_trim';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { generateFilmstrip } from '@/lib/video/thumbnails';
import { formatDuration, readVideoMeta } from '@/lib/video/video_formats';
import { BubbleOverlay } from './bubble_overlay';
import type { RecordingExportFormat } from './processor';
import {
  bubbleRect,
  cornerPosition,
  coverSourceRect,
  DEFAULT_BUBBLE,
  DEFAULT_QUALITY_ID,
  formatElapsed,
  MAX_BUBBLE_SIZE_RATIO,
  MIN_BUBBLE_SIZE_RATIO,
  pickSupportedMimeType,
  QUALITY_PRESETS,
  qualityById,
  RECORDER_MIME_CANDIDATES,
  RECORDING_PRESETS,
  type BubbleCorner,
  type BubbleSettings,
  type BubbleShape,
  type RecordSource,
} from './recorder';

type Phase = 'setup' | 'recording' | 'review';

const SOURCE_OPTIONS = [
  { value: 'screen' as const, label: 'Screen' },
  { value: 'camera' as const, label: 'Camera' },
  { value: 'screen_camera' as const, label: 'Screen + Camera' },
];

const CORNER_OPTIONS: { value: BubbleCorner; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
];

const SHAPE_OPTIONS = [
  { value: 'circle' as const, label: 'Circle' },
  { value: 'rounded' as const, label: 'Rounded' },
  { value: 'square' as const, label: 'Square' },
];

const EXPORT_FORMATS: { value: RecordingExportFormat; label: string }[] = [
  { value: 'webm', label: 'WebM' },
  { value: 'mp4', label: 'MP4' },
  { value: 'mov', label: 'MOV' },
  { value: 'gif', label: 'GIF' },
];

/** Draws a rounded rect / circle / square path for whichever shape the bubble uses, shared by
 *  the clip, the shadow fill and the border stroke so all three always agree on the outline. */
function bubblePath(ctx: CanvasRenderingContext2D, rect: { left: number; top: number; width: number; height: number }, shape: BubbleShape) {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width / 2, 0, Math.PI * 2);
  } else if (shape === 'rounded') {
    ctx.roundRect(rect.left, rect.top, rect.width, rect.height, rect.width * 0.18);
  } else {
    ctx.rect(rect.left, rect.top, rect.width, rect.height);
  }
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

/** A small pill button, shared by every device test action on this page — the standard Button
 *  component's own smallest size still read as oversized against this tool's denser panels. */
function compactButtonClass(variant: 'primary' | 'secondary' | 'ghost', extra = ''): string {
  const base = 'flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50';
  const variants: Record<typeof variant, string> = {
    primary: 'bg-brand text-on-brand hover:bg-brand-strong',
    secondary: 'bg-surface text-foreground border border-border hover:bg-surface-muted',
    ghost: 'text-muted hover:bg-surface-muted hover:text-foreground',
  };
  return `${base} ${variants[variant]} ${extra}`;
}

export function ScreenRecorderWorkspace() {
  const [phase, setPhase] = useState<Phase>('setup');

  const [source, setSource] = useState<RecordSource>('screen_camera');
  const [micEnabled, setMicEnabled] = useState(true);
  const [qualityId, setQualityId] = useState(DEFAULT_QUALITY_ID);
  const [bubble, setBubble] = useState<BubbleSettings>(DEFAULT_BUBBLE);
  const [activePresetId, setActivePresetId] = useState<string | null>('presentation');
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [deviceBusy, setDeviceBusy] = useState<'camera' | 'screen' | 'mic' | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);

  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedMeta, setRecordedMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [reviewTime, setReviewTime] = useState(0);
  const [exportFormat, setExportFormat] = useState<RecordingExportFormat>('webm');
  const [exportResult, setExportResult] = useState<{ file_name: string; blob: Blob } | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Compositing reads the latest bubble settings every frame without needing to tear down and
  // restart the rAF loop each time a slider or drag updates it.
  const bubbleRef = useRef(bubble);
  useEffect(() => {
    bubbleRef.current = bubble;
  }, [bubble]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('video/webm');
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const recordedUrlRef = useRef<string | null>(null);
  const exportUrlRef = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const thumbnailRequest = useRef(0);

  useEffect(
    () => () => {
      abort.current?.abort();
      stopStream(cameraStream);
      stopStream(screenStream);
      stopStream(micStream);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (meterRafRef.current) cancelAnimationFrame(meterRafRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
      audioCtxRef.current?.close().catch(() => {});
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
    },
    // Cleanup only ever runs on unmount; the streams/refs it stops are read fresh at that point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = cameraStream;
  }, [cameraStream]);
  useEffect(() => {
    if (screenVideoRef.current) screenVideoRef.current.srcObject = screenStream;
  }, [screenStream]);

  // Tracks the preview box's own rendered CSS size so the draggable bubble overlay's pixel math
  // always matches whatever size the canvas is actually displayed at, including on resize.
  useEffect(() => {
    const element = previewContainerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setPreviewSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Composites screen + camera bubble onto the canvas continuously, whether or not a recording
  // is in progress: this is what makes the bubble draggable and the preview accurate before ever
  // clicking Start, not just a static readout of settings nobody can see take effect.
  useEffect(() => {
    if (source !== 'screen_camera' || !screenStream || !cameraStream) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const quality = qualityById(qualityId);
    canvas.width = quality.width;
    canvas.height = quality.height;
    let active = true;

    function drawFrame() {
      const ctx = canvas!.getContext('2d');
      const screenEl = screenVideoRef.current;
      if (!ctx || !screenEl) return;
      ctx.drawImage(screenEl, 0, 0, canvas!.width, canvas!.height);

      const cameraEl = cameraVideoRef.current;
      if (cameraEl && cameraEl.videoWidth > 0) {
        const currentBubble = bubbleRef.current;
        const rect = bubbleRect(canvas!.width, canvas!.height, currentBubble);
        const { sx, sy, sw, sh } = coverSourceRect(cameraEl.videoWidth, cameraEl.videoHeight, rect);

        if (currentBubble.shadow) {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.4)';
          ctx.shadowBlur = rect.width * 0.12;
          ctx.shadowOffsetY = rect.width * 0.03;
          ctx.fillStyle = '#000';
          bubblePath(ctx, rect, currentBubble.shape);
          ctx.fill();
          ctx.restore();
        }

        ctx.save();
        bubblePath(ctx, rect, currentBubble.shape);
        ctx.clip();
        ctx.drawImage(cameraEl, sx, sy, sw, sh, rect.left, rect.top, rect.width, rect.height);
        ctx.restore();

        if (currentBubble.border) {
          ctx.save();
          ctx.lineWidth = Math.max(2, rect.width * 0.02);
          ctx.strokeStyle = '#ffffff';
          bubblePath(ctx, rect, currentBubble.shape);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    function loop() {
      if (!active) return;
      drawFrame();
      rafRef.current = requestAnimationFrame(loop);
    }

    Promise.all([screenVideoRef.current?.play().catch(() => {}), cameraVideoRef.current?.play().catch(() => {})]).then(
      () => {
        if (active) loop();
      },
    );

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [source, screenStream, cameraStream, qualityId]);

  // Mic level meter: routes the tested microphone through an analyser only (never to
  // ctx.destination) so the visitor sees their input level without hearing their own mic looped
  // back through the speakers.
  useEffect(() => {
    if (!micStream) {
      setMicLevel(0);
      return;
    }
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextCtor();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(micStream).connect(analyser);
    audioCtxRef.current = ctx;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i += 1) {
        const centered = ((data[i] ?? 128) - 128) / 128;
        sumSquares += centered * centered;
      }
      setMicLevel(Math.min(1, Math.sqrt(sumSquares / data.length) * 3.5));
      meterRafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (meterRafRef.current) cancelAnimationFrame(meterRafRef.current);
      ctx.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, [micStream]);

  function applyPreset(presetId: string) {
    const preset = RECORDING_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    setActivePresetId(presetId);
    setSource(preset.source);
    setQualityId(preset.quality_id);
    setMicEnabled(preset.mic);
    if (preset.bubble) setBubble(preset.bubble);
  }

  async function enableCamera() {
    setDeviceError(null);
    setDeviceBusy('camera');
    try {
      const quality = qualityById(qualityId);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: quality.width }, height: { ideal: quality.height }, frameRate: { ideal: quality.fps } },
      });
      stopStream(cameraStream);
      setCameraStream(stream);
    } catch {
      setDeviceError('The camera could not be started. Check that it is connected and permission is allowed.');
    } finally {
      setDeviceBusy(null);
    }
  }

  async function enableScreen() {
    setDeviceError(null);
    setDeviceBusy('screen');
    try {
      const quality = qualityById(qualityId);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: quality.width }, height: { ideal: quality.height }, frameRate: { ideal: quality.fps } },
        audio: false,
      });
      stopStream(screenStream);
      setScreenStream(stream);
      const [track] = stream.getVideoTracks();
      if (track) {
        track.onended = () => {
          setScreenStream((current) => (current === stream ? null : current));
          stopRecordingRef.current?.();
        };
      }
    } catch {
      setDeviceError('Screen sharing was not started. Pick a screen, window or tab to share.');
    } finally {
      setDeviceBusy(null);
    }
  }

  async function enableMic() {
    setDeviceError(null);
    setDeviceBusy('mic');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stopStream(micStream);
      setMicStream(stream);
    } catch {
      setDeviceError('The microphone could not be started. Check that it is connected and permission is allowed.');
    } finally {
      setDeviceBusy(null);
    }
  }

  function disableMic() {
    stopStream(micStream);
    setMicStream(null);
    setMicEnabled(false);
  }

  const needsScreen = source === 'screen' || source === 'screen_camera';
  const needsCamera = source === 'camera' || source === 'screen_camera';
  const screenReady = !needsScreen || screenStream !== null;
  const cameraReady = !needsCamera || cameraStream !== null;
  const micReady = !micEnabled || micStream !== null;
  const canStart = screenReady && cameraReady && micReady && (needsScreen || needsCamera);

  // The canvas composite only starts once BOTH screen and camera are live (it needs both to draw
  // the bubble); until then, showing a blank box while "Screen: Ready" is on screen reads as
  // broken. Falling straight back to whichever raw stream already exists keeps the preview alive
  // at every step instead of only once the whole screen_camera combo is ready.
  const compositing = source === 'screen_camera' && screenStream !== null && cameraStream !== null;
  const previewMode: 'composite' | 'screen' | 'camera' | 'empty' = compositing
    ? 'composite'
    : screenStream && needsScreen
      ? 'screen'
      : cameraStream && needsCamera
        ? 'camera'
        : 'empty';

  async function startRecording() {
    if (!canStart) return;
    setNotice(null);
    const quality = qualityById(qualityId);

    let videoTrackSource: MediaStream;
    if (source === 'screen_camera') {
      // The compositing effect above is already painting this canvas continuously (it starts as
      // soon as both screen and camera streams exist, so the bubble is draggable pre-recording
      // too) — capturing its stream here just taps into that ongoing paint, nothing new to draw.
      const canvas = canvasRef.current;
      if (!canvas) return;
      videoTrackSource = canvas.captureStream(quality.fps);
    } else if (source === 'screen') {
      videoTrackSource = screenStream!;
    } else {
      videoTrackSource = cameraStream!;
    }

    const tracks: MediaStreamTrack[] = [...videoTrackSource.getVideoTracks()];
    if (micEnabled && micStream) tracks.push(...micStream.getAudioTracks());
    const finalStream = new MediaStream(tracks);

    const mimeType = pickSupportedMimeType(RECORDER_MIME_CANDIDATES);
    mimeTypeRef.current = mimeType ?? 'video/webm';
    const recorder = new MediaRecorder(finalStream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      chunksRef.current = [];
      void handleRecordingFinished(blob);
    };
    recorderRef.current = recorder;
    recorder.start(1000);

    setRecording(true);
    setPaused(false);
    pausedRef.current = false;
    setElapsed(0);
    setPhase('recording');

    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      if (!pausedRef.current) setElapsed((value) => value + 1);
    }, 1000);
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause();
      pausedRef.current = true;
      setPaused(true);
    } else if (recorder.state === 'paused') {
      recorder.resume();
      pausedRef.current = false;
      setPaused(false);
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    stopStream(cameraStream);
    stopStream(screenStream);
    stopStream(micStream);
    setCameraStream(null);
    setScreenStream(null);
    setMicStream(null);
    setRecording(false);
    setPaused(false);
  }
  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  });

  async function handleRecordingFinished(blob: Blob) {
    const extension = mimeTypeRef.current.includes('webm') ? 'webm' : 'mp4';
    const file = new File([blob], `recording.${extension}`, { type: mimeTypeRef.current });
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    const url = URL.createObjectURL(blob);
    recordedUrlRef.current = url;
    setRecordedFile(file);
    setRecordedUrl(url);
    setReviewTime(0);
    setPhase('review');

    try {
      const meta = await readVideoMeta(file);
      setRecordedMeta(meta);
      setTrimStart(0);
      setTrimEnd(meta.duration);

      const requestId = (thumbnailRequest.current += 1);
      setLoadingThumbnails(true);
      try {
        const frames = await generateFilmstrip(file, meta.duration, 30);
        if (thumbnailRequest.current === requestId) setThumbnails(frames);
      } catch {
        // The filmstrip is a visual aid, not required; the trim bar still works without it.
      } finally {
        if (thumbnailRequest.current === requestId) setLoadingThumbnails(false);
      }
    } catch {
      setNotice('The recording finished but could not be read back for trimming. You can still download it below.');
    }
  }

  async function runExport() {
    if (!recordedFile) return;
    setNotice(null);
    setExportResult(null);
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
    exportUrlRef.current = null;
    setExportUrl(null);
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;
    try {
      const processor = await loadProcessor('video.screen-recorder');
      const output = await processor(
        { files: [recordedFile], options: { start: trimStart, end: trimEnd, format: exportFormat } },
        { signal: controller.signal, on_progress: setProgress },
      );
      const artifact = output.artifacts[0];
      if (artifact) {
        setExportResult({ file_name: artifact.file_name, blob: artifact.blob });
        const url = URL.createObjectURL(artifact.blob);
        exportUrlRef.current = url;
        setExportUrl(url);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice(error instanceof Error ? error.message : 'This recording could not be exported.');
      }
    } finally {
      abort.current = null;
      setProgress(null);
    }
  }

  function recordAgain() {
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
    recordedUrlRef.current = null;
    exportUrlRef.current = null;
    setRecordedFile(null);
    setRecordedUrl(null);
    setRecordedMeta(null);
    setThumbnails([]);
    setTrimStart(0);
    setTrimEnd(0);
    setReviewTime(0);
    setExportResult(null);
    setExportUrl(null);
    setNotice(null);
    setPhase('setup');
  }

  function seekReview(time: number) {
    const video = previewVideoRef.current;
    if (!video) return;
    video.currentTime = time;
    setReviewTime(time);
  }

  /** Scrubs the Recording player to whichever trim edge just moved, so dragging a handle (or the
   *  selected window itself) shows exactly that frame instead of leaving the player wherever it
   *  happened to be — the same sync GIF Maker's trim bar already gives its own preview. */
  function handleTrimChange(nextStart: number, nextEnd: number) {
    setTrimStart(nextStart);
    setTrimEnd(nextEnd);
    if (nextStart !== trimStart) seekReview(nextStart);
    else if (nextEnd !== trimEnd) seekReview(nextEnd);
  }

  const busy = progress !== null;
  const selectedSeconds = Math.max(0, trimEnd - trimStart);
  const canExport = recordedFile !== null && !busy && selectedSeconds >= 0.1;
  const percent = Math.round((progress?.ratio ?? 0) * 100);

  const previewLabel = deviceBusy === 'screen' ? 'Requesting screen…' : deviceBusy === 'camera' ? 'Requesting camera…' : null;

  const presetsAndSource = (
    <div className="flex flex-col gap-3">
      <div className="border-border bg-surface rounded-xl border p-2.5 shadow-sm">
        <div className="flex flex-col gap-3">
          <Field
            label="Quick presets"
            hint="Sets source, quality and camera bubble in one click; every field stays editable."
          >
            <div className="flex flex-col gap-1">
              {RECORDING_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  disabled={recording}
                  aria-pressed={activePresetId === preset.id}
                  className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                    activePresetId === preset.id ? 'bg-brand/10 border-brand' : 'border-border hover:bg-cream'
                  }`}
                >
                  <span className="block text-xs font-semibold">{preset.label}</span>
                  <span className="text-muted block text-[11px] leading-snug">{preset.description}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Source">
            <div className="flex gap-1.5">
              {SOURCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setSource(option.value);
                    setActivePresetId(null);
                  }}
                  disabled={recording}
                  aria-pressed={source === option.value}
                  className={`flex-1 rounded-full border px-2 py-1 text-xs font-semibold transition-colors ${
                    source === option.value
                      ? 'bg-brand border-brand text-on-brand'
                      : 'border-border text-muted hover:text-foreground'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Quality">
            <div className="flex flex-wrap gap-1.5">
              {QUALITY_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setQualityId(preset.id);
                    setActivePresetId(null);
                  }}
                  disabled={recording}
                  aria-pressed={qualityId === preset.id}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    qualityId === preset.id
                      ? 'bg-brand border-brand text-on-brand'
                      : 'border-border text-muted hover:text-foreground'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>
    </div>
  );

  const previewAndDevices = (
    <div className="flex flex-col gap-3">
      <div className="border-border bg-surface flex flex-col overflow-hidden rounded-xl border shadow-sm">
        <div className="flex items-center justify-between px-2.5 pt-2">
          <span className="text-muted text-xs font-semibold tracking-wide uppercase">
            {phase === 'recording' ? 'Recording' : 'Preview'}
          </span>
          {phase === 'recording' && (
            <span className="text-danger flex items-center gap-1.5 text-xs font-bold">
              <Circle aria-hidden className="size-2.5 animate-pulse" fill="currentColor" />
              {paused ? 'Paused' : 'Recording'} · {formatElapsed(elapsed)}
            </span>
          )}
          {phase === 'setup' && (
            <button
              type="button"
              onClick={() => previewContainerRef.current?.requestFullscreen?.()}
              aria-label="View preview full screen"
              title="Full screen"
              className="text-muted hover:text-foreground"
            >
              <Maximize2 aria-hidden className="size-3.5" />
            </button>
          )}
        </div>

        <div
          ref={previewContainerRef}
          className="bg-ink/5 relative mx-auto mt-2 aspect-video max-h-[480px] w-full overflow-hidden"
        >
          {/* Both sources, when needed, stay mounted and playing for as long as this source mode
              needs them — never swapped for a second `display:none` copy — since Chrome stops
              updating a video element's decoded frame for canvas capture once it's display:none,
              which silently left the composited canvas blank. Whichever one `previewMode` isn't
              currently showing just sits at opacity-0, still decoding, ready to feed the canvas
              the moment both are live. */}
          {needsScreen && (
            <video
              ref={screenVideoRef}
              autoPlay
              muted
              playsInline
              className={`absolute inset-0 size-full object-contain ${previewMode === 'screen' ? '' : 'opacity-0'}`}
            />
          )}
          {needsCamera && (
            <video
              ref={cameraVideoRef}
              autoPlay
              muted
              playsInline
              className={`absolute inset-0 size-full object-contain ${previewMode === 'camera' ? '' : 'opacity-0'}`}
            />
          )}
          {source === 'screen_camera' && (
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 size-full object-contain ${previewMode === 'composite' ? '' : 'opacity-0'}`}
            />
          )}
          {compositing && previewSize.width > 0 && (
            <BubbleOverlay
              containerSize={previewSize}
              naturalSize={{ width: qualityById(qualityId).width, height: qualityById(qualityId).height }}
              bubble={bubble}
              onChange={(next) => {
                setBubble(next);
                setActivePresetId(null);
              }}
            />
          )}
          {previewMode === 'empty' && (
            <p className="text-muted pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm">
              {previewLabel ?? 'Test the sources you need below, then preview them here.'}
            </p>
          )}
          {source === 'screen_camera' && (previewMode === 'screen' || previewMode === 'camera') && (
            <p className="bg-background/90 text-foreground pointer-events-none absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm">
              {previewMode === 'screen' ? 'Add your camera to see the bubble overlay' : 'Add your screen to see the bubble overlay'}
            </p>
          )}
        </div>

        {phase === 'recording' && (
          <div className="flex items-center justify-center gap-2 px-2.5 py-2">
            <button type="button" onClick={togglePause} className={compactButtonClass('secondary')}>
              {paused ? <Play aria-hidden className="size-3" /> : <Pause aria-hidden className="size-3" />}
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" onClick={stopRecording} className={compactButtonClass('primary')}>
              <Square aria-hidden className="size-3" fill="currentColor" />
              Stop recording
            </button>
          </div>
        )}
      </div>

      {phase === 'setup' && (
        <div className="border-border bg-surface flex flex-col gap-2 rounded-xl border p-2.5 shadow-sm">
          <p className="text-foreground text-xs font-bold">Test your devices</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {needsScreen && (
              <div className="border-border rounded-lg border p-2">
                <div className="flex items-center gap-1.5">
                  <Monitor aria-hidden className="text-muted size-3.5" />
                  <span className="text-xs font-semibold">Screen</span>
                </div>
                <p className="text-muted mt-0.5 text-[11px]">
                  {screenStream ? 'Ready — sharing your screen.' : 'Not shared yet.'}
                </p>
                <button
                  type="button"
                  onClick={enableScreen}
                  disabled={deviceBusy !== null}
                  className={compactButtonClass(screenStream ? 'secondary' : 'primary', 'mt-1.5 w-full')}
                >
                  {deviceBusy === 'screen' ? (
                    <Loader2 aria-hidden className="size-3 animate-spin" />
                  ) : (
                    <Monitor aria-hidden className="size-3" />
                  )}
                  {screenStream ? 'Change screen' : 'Share screen'}
                </button>
              </div>
            )}
            {needsCamera && (
              <div className="border-border rounded-lg border p-2">
                <div className="flex items-center gap-1.5">
                  <Camera aria-hidden className="text-muted size-3.5" />
                  <span className="text-xs font-semibold">Camera</span>
                </div>
                <p className="text-muted mt-0.5 text-[11px]">
                  {cameraStream ? 'Ready — camera is live.' : 'Not started yet.'}
                </p>
                <button
                  type="button"
                  onClick={enableCamera}
                  disabled={deviceBusy !== null}
                  className={compactButtonClass(cameraStream ? 'secondary' : 'primary', 'mt-1.5 w-full')}
                >
                  {deviceBusy === 'camera' ? (
                    <Loader2 aria-hidden className="size-3 animate-spin" />
                  ) : (
                    <Camera aria-hidden className="size-3" />
                  )}
                  {cameraStream ? 'Restart camera' : 'Test camera'}
                </button>
              </div>
            )}
            <div className="border-border rounded-lg border p-2">
              <div className="flex items-center gap-1.5">
                {micEnabled ? (
                  <Mic aria-hidden className="text-muted size-3.5" />
                ) : (
                  <MicOff aria-hidden className="text-muted size-3.5" />
                )}
                <span className="text-xs font-semibold">Microphone</span>
              </div>
              {micEnabled ? (
                <>
                  <div className="bg-cream mt-1 h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-brand h-full rounded-full transition-[width] duration-75"
                      style={{ width: `${Math.round(micLevel * 100)}%` }}
                    />
                  </div>
                  <p className="text-muted mt-0.5 text-[11px]">
                    {micStream ? 'Speak to see the level move.' : 'Not started yet.'}
                  </p>
                  <div className="mt-1.5 flex gap-1">
                    <button
                      type="button"
                      onClick={enableMic}
                      disabled={deviceBusy !== null}
                      className={compactButtonClass(micStream ? 'secondary' : 'primary', 'flex-1')}
                    >
                      {deviceBusy === 'mic' ? (
                        <Loader2 aria-hidden className="size-3 animate-spin" />
                      ) : (
                        <Mic aria-hidden className="size-3" />
                      )}
                      {micStream ? 'Restart mic' : 'Test mic'}
                    </button>
                    {micStream && (
                      <button type="button" onClick={disableMic} className={compactButtonClass('ghost')}>
                        Off
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-muted mt-0.5 text-[11px]">Microphone is off for this recording.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMicEnabled(true);
                      void enableMic();
                    }}
                    disabled={deviceBusy !== null}
                    className={compactButtonClass('secondary', 'mt-1.5 w-full')}
                  >
                    <Mic aria-hidden className="size-3" />
                    Turn on mic
                  </button>
                </>
              )}
            </div>
          </div>
          {deviceError && <Notice>{deviceError}</Notice>}
        </div>
      )}
    </div>
  );

  const bubbleAndStart = (
    <div className="flex flex-col gap-3">
      <div className="border-border bg-surface rounded-xl border p-2.5 shadow-sm">
        <div className="flex flex-col gap-3">
          {source === 'screen_camera' ? (
            <>
              <Field
                label="Camera bubble position"
                hint="Drag the bubble on the preview to place it, or snap it to a corner."
              >
                <div className="flex flex-wrap gap-1.5">
                  {CORNER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setBubble((current) => ({ ...current, ...cornerPosition(option.value, current.sizeRatio) }));
                        setActivePresetId(null);
                      }}
                      disabled={recording}
                      className="border-border text-muted hover:text-foreground rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-40"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </Field>
              <SliderField
                label="Camera bubble size"
                value={Math.round(bubble.sizeRatio * 100)}
                onChange={(value) => {
                  setBubble((current) => ({ ...current, sizeRatio: value / 100 }));
                  setActivePresetId(null);
                }}
                min={Math.round(MIN_BUBBLE_SIZE_RATIO * 100)}
                max={Math.round(MAX_BUBBLE_SIZE_RATIO * 100)}
                suffix="%"
                disabled={recording}
              />
              <Field label="Camera bubble shape">
                <div className="flex gap-1.5">
                  {SHAPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setBubble((current) => ({ ...current, shape: option.value }));
                        setActivePresetId(null);
                      }}
                      disabled={recording}
                      aria-pressed={bubble.shape === option.value}
                      className={`flex-1 rounded-full border px-2 py-1 text-xs font-semibold transition-colors ${
                        bubble.shape === option.value
                          ? 'bg-brand border-brand text-on-brand'
                          : 'border-border text-muted hover:text-foreground'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={bubble.border}
                    disabled={recording}
                    onChange={(event) => {
                      setBubble((current) => ({ ...current, border: event.target.checked }));
                      setActivePresetId(null);
                    }}
                    className="accent-brand size-3.5"
                  />
                  Border
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={bubble.shadow}
                    disabled={recording}
                    onChange={(event) => {
                      setBubble((current) => ({ ...current, shadow: event.target.checked }));
                      setActivePresetId(null);
                    }}
                    className="accent-brand size-3.5"
                  />
                  Drop shadow
                </label>
              </div>
            </>
          ) : (
            <p className="text-muted text-xs">
              Pick &ldquo;Screen + Camera&rdquo; as the source to overlay a draggable webcam bubble
              on the recording.
            </p>
          )}

          {phase === 'setup' && (
            <button
              type="button"
              onClick={startRecording}
              disabled={!canStart || recording}
              className="bg-brand text-on-brand hover:bg-brand-strong flex h-10 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              <Circle aria-hidden className="size-3.5" fill="currentColor" />
              Start recording
            </button>
          )}
          {phase === 'setup' && !canStart && (
            <p className="text-muted text-[11px]">
              Test every source this recording needs before starting — the same camera, screen and
              microphone you preview above is exactly what gets recorded.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (phase !== 'review') {
    return (
      <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-x-hidden px-4 sm:px-6">
        <div className="mx-auto w-full max-w-[1680px]">
          <div className="grid items-start gap-3 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
            {presetsAndSource}
            {previewAndDevices}
            {bubbleAndStart}
          </div>
        </div>
      </div>
    );
  }

  return (
    <VideoWorkspaceLayout
      stage={
        <div className="flex flex-col gap-3">
          {phase === 'review' && recordedUrl && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="border-border bg-surface flex flex-col overflow-hidden rounded-xl border shadow-sm">
                <div className="px-2.5 pt-2">
                  <span className="text-muted text-xs font-semibold tracking-wide uppercase">Recording</span>
                </div>
                <div className="bg-ink/5 relative mt-1.5 flex aspect-video max-h-[320px] w-full items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    ref={previewVideoRef}
                    src={recordedUrl}
                    controls
                    onTimeUpdate={(event) => setReviewTime(event.currentTarget.currentTime)}
                    className="size-full object-contain"
                  />
                </div>
                <p className="text-muted border-border/60 border-t px-2.5 pt-1.5 pb-2 text-[11px]">
                  {recordedFile?.name} · {recordedFile ? formatBytes(recordedFile.size) : ''}
                  {recordedMeta
                    ? ` · ${formatDuration(recordedMeta.duration)} · ${recordedMeta.width}×${recordedMeta.height}`
                    : ''}
                </p>
              </div>

              <div className="border-border bg-surface flex flex-col overflow-hidden rounded-xl border shadow-sm">
                <div className="px-2.5 pt-2">
                  <span className="text-muted text-xs font-semibold tracking-wide uppercase">Exported</span>
                </div>
                <div className="bg-ink/5 relative mt-1.5 flex aspect-video max-h-[320px] w-full items-center justify-center overflow-hidden">
                  {exportResult && exportUrl ? (
                    exportFormat === 'gif' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={exportUrl} alt="Exported GIF preview" className="max-h-full max-w-full object-contain" />
                    ) : (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={exportUrl} controls className="size-full object-contain" />
                    )
                  ) : (
                    <p className="text-muted px-6 text-center text-xs">
                      {busy ? `Exporting ${percent}%` : 'Pick a format and export to see it here.'}
                    </p>
                  )}
                </div>
                {exportResult && (
                  <p className="text-muted border-border/60 border-t px-2.5 pt-1.5 pb-2 text-[11px]">
                    {exportResult.file_name} · {formatBytes(exportResult.blob.size)}
                  </p>
                )}
              </div>
            </div>
          )}

          {phase === 'review' && recordedMeta && (
            <div className="border-border bg-surface flex flex-col gap-2 rounded-xl border p-2.5 shadow-sm">
              <p className="text-foreground text-xs font-bold">Quick edit</p>
              <RangeTrim
                duration={recordedMeta.duration}
                start={trimStart}
                end={trimEnd}
                thumbnails={thumbnails}
                loadingThumbnails={loadingThumbnails}
                disabled={busy}
                currentTime={reviewTime}
                onSeek={seekReview}
                onChange={handleTrimChange}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted text-xs">
                  Trimmed to {formatDuration(trimStart)}–{formatDuration(trimEnd)} ·{' '}
                  <span className="font-semibold">{formatDuration(selectedSeconds)}</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTrimStart(0);
                    setTrimEnd(recordedMeta.duration);
                  }}
                  disabled={busy}
                  className="text-brand-strong text-xs font-semibold hover:underline disabled:opacity-40"
                >
                  Use whole recording
                </button>
              </div>
            </div>
          )}
        </div>
      }
      panel={
        <div className="flex flex-col gap-3">
          <Field label="Export format">
            <div className="flex flex-wrap gap-1.5">
              {EXPORT_FORMATS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setExportFormat(option.value);
                    setExportResult(null);
                  }}
                  disabled={busy}
                  aria-pressed={exportFormat === option.value}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    exportFormat === option.value
                      ? 'bg-brand border-brand text-on-brand'
                      : 'border-border text-muted hover:text-foreground'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>

          {exportFormat === 'gif' && (
            <Notice variant="info">
              GIF has no audio and keeps at most 256 colours. Long selections are capped to the
              first 20 seconds.
            </Notice>
          )}
          {exportFormat === 'webm' && (
            <Notice variant="info">
              WebM matches how this was recorded, so exporting it is the fastest option.
            </Notice>
          )}

          {notice && <Notice>{notice}</Notice>}
          {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

          <button
            type="button"
            onClick={runExport}
            disabled={!canExport}
            className="bg-brand text-on-brand hover:bg-brand-strong flex h-10 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Download aria-hidden className="size-3.5" />}
            {busy ? `Exporting ${percent}%` : `Export ${EXPORT_FORMATS.find((f) => f.value === exportFormat)?.label}`}
          </button>

          {exportResult && (
            <button
              type="button"
              onClick={() => downloadBlob(exportResult.blob, exportResult.file_name)}
              className={compactButtonClass('secondary', 'w-full h-9 text-xs')}
            >
              <Download aria-hidden className="size-3.5" />
              Download
            </button>
          )}

          {recordedFile && (
            <button
              type="button"
              onClick={() => downloadBlob(recordedFile, recordedFile.name)}
              className={compactButtonClass('ghost', 'w-full')}
            >
              Download the original recording, untrimmed
            </button>
          )}

          <button type="button" onClick={recordAgain} className={compactButtonClass('ghost')}>
            <RefreshCw aria-hidden className="size-3" />
            Record again
          </button>
        </div>
      }
    />
  );
}

