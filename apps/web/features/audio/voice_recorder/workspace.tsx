'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  FileText,
  Gauge,
  Headphones,
  Loader2,
  Mic,
  Music,
  Pause,
  Radio,
  Square,
  Trash2,
} from 'lucide-react';
import { formatBytes } from '@tools/file_utils';
import type { ProcessorArtifact, ProcessorProgress } from '@tools/tool_engine';
import { Button } from '@/components/ui/button';
import { ControlPanel, Field, Notice, ProgressBar } from '@/components/video/control_panel';
import { VideoWorkspaceLayout } from '@/components/video/video_workspace_layout';
import { WaveformPlayer } from '@/components/audio/waveform_player';
import { downloadBlob } from '@/lib/browser/download';
import { loadProcessor } from '@/lib/processing/processor_registry';
import { readAudioMeta, type AudioMeta } from '@/lib/audio/audio_formats';
import {
  extensionForMimeType,
  MAX_CUSTOM_KBPS,
  MIN_CUSTOM_KBPS,
  pickCaptureMimeType,
  QUALITY_PRESETS,
  SAMPLE_RATE_OPTIONS,
  type QualityPresetId,
} from './formats';
import { convertToWavFile } from './wav';
import type { VoiceRecorderOptions } from './processor';

type RecorderState = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopped';

interface Result {
  artifact: ProcessorArtifact;
}

/** `hh:mm:ss`, since a recording can run far longer than the `mm:ss.d` other audio tools use for
 *  a fixed source file. */
function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const METER_WIDTH = 900;
const METER_HEIGHT = 120;
const METER_BARS = 96;

interface LiveLevelMeterProps {
  analyser: AnalyserNode | null;
  active: boolean;
}

/** A scrolling level meter driven by an `AnalyserNode`, standing in for a waveform while audio is
 *  still being captured and there's no finished file yet to decode one from. */
function LiveLevelMeter({ analyser, active }: LiveLevelMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelsRef = useRef<number[]>(new Array(METER_BARS).fill(0));
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = METER_WIDTH * dpr;
    canvas.height = METER_HEIGHT * dpr;
    canvas.style.width = `${METER_WIDTH}px`;
    canvas.style.height = `${METER_HEIGHT}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, METER_WIDTH, METER_HEIGHT);
    const styles = getComputedStyle(canvas);
    const color = styles.getPropertyValue('--color-brand').trim() || '#f5b942';
    const unplayedColor = styles.getPropertyValue('--color-border').trim() || '#e2ddd0';
    const mid = METER_HEIGHT / 2;
    const barWidth = METER_WIDTH / METER_BARS;
    const levels = levelsRef.current;
    for (let i = 0; i < levels.length; i += 1) {
      const x = i * barWidth;
      const height = Math.max(2, (levels[i] ?? 0) * (METER_HEIGHT - 16));
      ctx.fillStyle = active ? color : unplayedColor;
      ctx.fillRect(x, mid - height / 2, Math.max(1, barWidth - 1), height);
    }
  }, [active]);

  useEffect(() => {
    if (!active || !analyser) {
      draw();
      return;
    }
    dataRef.current ??= new Uint8Array(new ArrayBuffer(analyser.fftSize));

    function tick() {
      if (!analyser) return;
      const data = dataRef.current;
      if (!data) return;
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i += 1) {
        const centered = ((data[i] ?? 128) - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const level = Math.min(1, rms * 3.2);
      const levels = levelsRef.current;
      levels.shift();
      levels.push(level);
      draw();
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, analyser, draw]);

  return (
    <div className="border-border bg-cream/50 overflow-x-auto rounded-xl border">
      <canvas ref={canvasRef} className="block" aria-hidden />
    </div>
  );
}

export function VoiceRecorderWorkspace() {
  const [recorderState, setRecorderState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [qualityPreset, setQualityPreset] = useState<QualityPresetId | 'custom'>('standard');
  const [customKbps, setCustomKbps] = useState(128);
  const [sampleRate, setSampleRate] = useState(44100);
  const [channels, setChannels] = useState<1 | 2>(1);

  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedMeta, setRecordedMeta] = useState<AudioMeta | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessorProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const abort = useRef<AbortController | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const captureMimeRef = useRef('');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentStartRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const recordedUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  async function refreshDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((device) => device.kind === 'audioinput'));
    } catch {
      // Devices simply stay unlisted; the browser's own default input is still used.
    }
  }

  useEffect(() => {
    // Listing input devices is an on demand fetch from a browser API, not a value derived from
    // props or state, so there's no dependency this effect could instead synchronize with.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
      abort.current?.abort();
      stopTimer();
      teardownStream();
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      audioCtxRef.current?.close().catch(() => {
        // Nothing more to clean up if the context refuses to close.
      });
    };
  }, []);

  function stopTimer() {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function teardownStream() {
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
  }

  function clearResult() {
    setResult(null);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResultUrl(null);
  }

  async function startRecording() {
    setNotice(null);
    clearResult();
    setRecorderState('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          channelCount: channels,
          sampleRate,
        },
      });
      streamRef.current = stream;
      await refreshDevices();

      const AudioContextClass =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current ??= new AudioContextClass();
        const context = audioCtxRef.current;
        if (context.state === 'suspended') await context.resume().catch(() => {
          // The meter just stays flat if the context can't resume; recording itself is unaffected.
        });
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyserRef.current = analyser;
      }

      const mimeType = pickCaptureMimeType();
      captureMimeRef.current = mimeType;
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => finalizeRecording();
      recorderRef.current = recorder;
      recorder.start();

      accumulatedMsRef.current = 0;
      segmentStartRef.current = Date.now();
      setElapsedMs(0);
      timerRef.current = setInterval(() => {
        setElapsedMs(accumulatedMsRef.current + (Date.now() - segmentStartRef.current));
      }, 200);

      setRecorderState('recording');
    } catch {
      setRecorderState('idle');
      setNotice(
        'Microphone access was denied or is unavailable. Allow microphone access in your browser and try again.',
      );
    }
  }

  function pauseRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.pause();
    stopTimer();
    accumulatedMsRef.current += Date.now() - segmentStartRef.current;
    setRecorderState('paused');
  }

  function resumeRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    recorder.resume();
    segmentStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(accumulatedMsRef.current + (Date.now() - segmentStartRef.current));
    }, 200);
    setRecorderState('recording');
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    stopTimer();
    recorder.stop();
    teardownStream();
  }

  async function finalizeRecording() {
    const capturedType = captureMimeRef.current || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: capturedType });
    chunksRef.current = [];
    const stamp = Date.now();

    // The raw capture is opus in most browsers, which this app's ffmpeg core has documented
    // trouble decoding reliably (see docs/audio_tools.md). Converting it to a plain WAV here,
    // through the browser's own decoder, means ffmpeg never has to touch the opus stream at all.
    const wavFile = await convertToWavFile(blob, `voice-recording-${stamp}.wav`);
    const extension = extensionForMimeType(capturedType);
    const file = wavFile ?? new File([blob], `voice-recording-${stamp}.${extension}`, { type: capturedType });

    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    const url = URL.createObjectURL(file);
    recordedUrlRef.current = url;
    setRecordedFile(file);
    setRecordedUrl(url);
    setRecordedMeta(null);
    setRecorderState('stopped');

    if (!wavFile) {
      setNotice(
        'The recording could not be converted to a standard format in your browser; export may not work for this take.',
      );
    }

    try {
      const meta = await readAudioMeta(file);
      setRecordedMeta(meta);
    } catch {
      setNotice('The recording finished, but a waveform preview isn’t available for it.');
    }
  }

  function resetAll() {
    abort.current?.abort();
    stopTimer();
    teardownStream();
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    recordedUrlRef.current = null;
    clearResult();
    setRecordedFile(null);
    setRecordedUrl(null);
    setRecordedMeta(null);
    setElapsedMs(0);
    setNotice(null);
    setProgress(null);
    setRecorderState('idle');
  }

  const busy = progress !== null;
  const recording = recorderState === 'recording';
  const paused = recorderState === 'paused';
  const stopped = recorderState === 'stopped';
  const requesting = recorderState === 'requesting';

  const quality = QUALITY_PRESETS.find((preset) => preset.id === qualityPreset);
  const kbps = qualityPreset === 'custom' ? customKbps : (quality?.kbps ?? 128);

  const duration = recordedMeta?.duration ?? elapsedMs / 1000;
  const estimatedBytes = duration > 0 ? Math.round((kbps * 1000 * duration) / 8) : 0;

  const options: VoiceRecorderOptions = {
    bitrate_kbps: kbps,
    sample_rate: sampleRate,
    channels,
  };

  const canRun = recordedFile !== null && !busy;

  async function run() {
    if (!recordedFile || !canRun) return;
    setNotice(null);
    clearResult();
    setProgress({ ratio: 0, label: 'Starting' });

    const controller = new AbortController();
    abort.current = controller;

    try {
      const processor = await loadProcessor('audio.voice-recorder');
      const output = await processor(
        { files: [recordedFile], options: { ...options } },
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
        setNotice(error instanceof Error ? error.message : 'This recording could not be processed.');
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
        <div className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
                  recording ? 'bg-danger text-white' : 'bg-brand text-on-brand'
                }`}
              >
                <Mic aria-hidden className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{formatClock(elapsedMs)}</p>
                <p className="text-muted text-xs">
                  {requesting && 'Waiting for microphone access…'}
                  {recorderState === 'idle' && 'Press record to start'}
                  {recording && 'Recording'}
                  {paused && 'Paused'}
                  {stopped && 'Recording finished'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!recording && !paused && (
                <Button onClick={startRecording} disabled={requesting} className="h-11 px-5">
                  {requesting ? (
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <Mic aria-hidden className="size-4" />
                  )}
                  {stopped ? 'Record Again' : 'Record'}
                </Button>
              )}
              {paused && (
                <Button onClick={resumeRecording} className="h-11 px-5">
                  <Mic aria-hidden className="size-4" />
                  Resume
                </Button>
              )}
              {(recording || paused) && (
                <>
                  {recording && (
                    <Button variant="secondary" onClick={pauseRecording} className="h-11 px-5">
                      <Pause aria-hidden className="size-4" />
                      Pause
                    </Button>
                  )}
                  <Button variant="secondary" onClick={stopRecording} className="h-11 px-5">
                    <Square aria-hidden className="size-4" />
                    Stop
                  </Button>
                </>
              )}
              {(stopped || paused) && (
                <Button variant="ghost" onClick={resetAll} className="text-danger h-11 px-3">
                  <Trash2 aria-hidden className="size-4" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          {!stopped && <LiveLevelMeter analyser={analyserRef.current} active={recording} />}

          {stopped && recordedUrl && recordedMeta && (
            <WaveformPlayer
              key={recordedUrl}
              src={recordedUrl}
              peaks={recordedMeta.peaks}
              duration={recordedMeta.duration}
            />
          )}
          {stopped && recordedUrl && !recordedMeta && (
            <div className="bg-cream/50 h-[120px] animate-pulse rounded-xl" />
          )}

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
      }
      panel={
        <ControlPanel>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Field label="Microphone">
              <select
                value={selectedDeviceId}
                disabled={recording || paused}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
                className="border-border bg-background h-10 w-full rounded-full border px-3 text-sm outline-none disabled:opacity-50"
              >
                <option value="">System default</option>
                {devices.map((device, index) => (
                  <option key={device.deviceId || index} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Audio Quality">
              <select
                value={qualityPreset}
                disabled={recording || paused}
                onChange={(event) => setQualityPreset(event.target.value as QualityPresetId | 'custom')}
                className="border-border bg-background h-10 w-full rounded-full border px-3 text-sm outline-none disabled:opacity-50"
              >
                {QUALITY_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} ({preset.kbps} kbps)
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
              {qualityPreset === 'custom' && (
                <input
                  type="number"
                  min={MIN_CUSTOM_KBPS}
                  max={MAX_CUSTOM_KBPS}
                  value={customKbps}
                  disabled={recording || paused}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (!Number.isNaN(parsed)) setCustomKbps(parsed);
                  }}
                  onBlur={(event) => {
                    const parsed = Number(event.target.value);
                    setCustomKbps(Math.min(MAX_CUSTOM_KBPS, Math.max(MIN_CUSTOM_KBPS, parsed || 128)));
                  }}
                  aria-label="Custom bitrate in kbps"
                  className="border-border bg-background mt-2 h-10 w-full rounded-full border px-3 text-sm outline-none disabled:opacity-50"
                />
              )}
            </Field>

            <Field label="Sample Rate">
              <select
                value={sampleRate}
                disabled={recording || paused}
                onChange={(event) => setSampleRate(Number(event.target.value))}
                className="border-border bg-background h-10 w-full rounded-full border px-3 text-sm outline-none disabled:opacity-50"
              >
                {SAMPLE_RATE_OPTIONS.map((rate) => (
                  <option key={rate} value={rate}>
                    {(rate / 1000).toFixed(rate % 1000 === 0 ? 0 : 2)} kHz
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Channels">
            <div className="flex gap-2">
              {(
                [
                  { value: 1, label: 'Mono' },
                  { value: 2, label: 'Stereo' },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setChannels(option.value)}
                  disabled={recording || paused}
                  aria-pressed={channels === option.value}
                  className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                    channels === option.value
                      ? 'bg-brand border-brand text-on-brand'
                      : 'border-border text-muted hover:text-foreground'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>

          {notice && <Notice>{notice}</Notice>}
          {busy && <ProgressBar progress={progress?.ratio ?? 0} label={progress?.label} />}

          <div className="border-border grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div className="flex items-center gap-2">
              <FileText aria-hidden className="text-muted size-4 shrink-0" />
              <span>
                <span className="text-muted block text-xs">Duration</span>
                <span className="font-semibold">{formatClock(elapsedMs)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Gauge aria-hidden className="text-muted size-4 shrink-0" />
              <span>
                <span className="text-muted flex items-center gap-1 text-xs">
                  Size
                  <span title="Estimated from the recording's length and chosen quality; the real exported size shows once export finishes.">
                    (?)
                  </span>
                </span>
                <span className="font-semibold">{estimatedBytes > 0 ? formatBytes(estimatedBytes) : '0 KB'}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Music aria-hidden className="text-muted size-4 shrink-0" />
              <span>
                <span className="text-muted block text-xs">Format</span>
                <span className="font-semibold">MP3</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Radio aria-hidden className="text-muted size-4 shrink-0" />
              <span>
                <span className="text-muted block text-xs">Sample Rate</span>
                <span className="font-semibold">{(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 2)} kHz</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Headphones aria-hidden className="text-muted size-4 shrink-0" />
              <span>
                <span className="text-muted block text-xs">Channels</span>
                <span className="font-semibold">{channels === 1 ? 'Mono' : 'Stereo'}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Gauge aria-hidden className="text-muted size-4 shrink-0" />
              <span>
                <span className="text-muted block text-xs">Quality</span>
                <span className="font-semibold">{kbps} kbps</span>
              </span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={result ? () => downloadBlob(result.artifact.blob, result.artifact.file_name) : run}
              disabled={!canRun}
              className="h-12 px-6 text-base"
            >
              {busy ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Download aria-hidden className="size-4" />
              )}
              {busy
                ? `Exporting ${Math.round((progress?.ratio ?? 0) * 100)}%`
                : result
                  ? 'Download Recording'
                  : 'Export Recording'}
            </Button>
          </div>
        </ControlPanel>
      }
    />
  );
}
