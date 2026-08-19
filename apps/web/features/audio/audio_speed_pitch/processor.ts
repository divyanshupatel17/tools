import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { audioRule } from '@/lib/audio/audio_formats';
import { MIME_BY_EXTENSION, codecForExtension } from './formats';

export interface AudioSpeedPitchOptions {
  /** 10..1000, 100 is the source's own speed. */
  speed_percent: number;
  /** -12..+12 semitones, 0 is the source's own pitch. Always shifts pitch without changing
   *  duration, independent of `preserve_pitch`. */
  pitch_semitones: number;
  /** When true, the speed change keeps the original pitch (a real time stretch via ffmpeg's
   *  `atempo`). When false, speed and pitch move together, the way a turntable sped up or slowed
   *  down sounds. */
  preserve_pitch: boolean;
  /** The source file's own sample rate, used for the asetrate based pitch shift filter. Falls
   *  back to 44100 when the browser could not decode the file into PCM to read it. */
  source_sample_rate: number;
  /** Bitrate for a lossy re-encode, estimated from the source file. Ignored for a lossless
   *  codec. */
  bitrate_kbps: number;
}

const RULE = audioRule();
const MIN_KBPS = 32;
const MAX_KBPS = 320;
const MIN_SPEED_PERCENT = 10;
const MAX_SPEED_PERCENT = 1000;

/** Splits a tempo factor into a chain of ffmpeg `atempo` filters, since a single `atempo` only
 *  accepts 0.5..2.0. Shared by the real encode and the workspace's own duration estimate. */
export function atempoChain(factor: number): number[] {
  if (!Number.isFinite(factor) || factor <= 0) return [];
  const stages: number[] = [];
  let remaining = factor;
  while (remaining > 2) {
    stages.push(2);
    remaining /= 2;
  }
  while (remaining < 0.5) {
    stages.push(0.5);
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1) > 1e-6) stages.push(remaining);
  return stages;
}

/** The single source of truth for what speed factor an options object actually applies. */
export function resolveSpeedFactor(speedPercent: number): number {
  return Math.min(MAX_SPEED_PERCENT, Math.max(MIN_SPEED_PERCENT, speedPercent)) / 100;
}

/** The single source of truth for what pitch multiplier an options object actually applies. */
export function resolvePitchFactor(pitchSemitones: number): number {
  return 2 ** (pitchSemitones / 12);
}

export function buildSpeedPitchArgs(
  options: AudioSpeedPitchOptions,
  extension: string,
  inputName: string,
  outputName: string,
): string[] {
  const spec = codecForExtension(extension);
  const sampleRate = options.source_sample_rate > 0 ? Math.round(options.source_sample_rate) : 44100;
  const speedFactor = resolveSpeedFactor(options.speed_percent);
  const pitchFactor = resolvePitchFactor(options.pitch_semitones);

  const filters: string[] = [];

  if (Math.abs(speedFactor - 1) > 1e-6) {
    if (options.preserve_pitch) {
      filters.push(...atempoChain(speedFactor).map((stage) => `atempo=${stage.toFixed(6)}`));
    } else {
      filters.push(`asetrate=${Math.round(sampleRate * speedFactor)}`, `aresample=${sampleRate}`);
    }
  }

  if (Math.abs(options.pitch_semitones) > 1e-6) {
    // Reinterpreting the sample rate shifts pitch and tempo together; compensating with atempo
    // by the inverse factor restores the original duration, leaving only the pitch shifted. The
    // compensation factor lands in [0.5, 2] for the whole -12..+12 semitone range, so it never
    // needs its own chain.
    filters.push(
      `asetrate=${Math.round(sampleRate * pitchFactor)}`,
      `aresample=${sampleRate}`,
      `atempo=${(1 / pitchFactor).toFixed(6)}`,
    );
  }

  const args = ['-i', inputName];
  if (filters.length > 0) args.push('-af', filters.join(','));
  args.push(...spec.codec);
  const kbps = Math.min(MAX_KBPS, Math.max(MIN_KBPS, Math.round(options.bitrate_kbps || 160)));
  if (!spec.lossless) args.push('-b:a', `${kbps}k`);
  args.push(outputName);
  return args;
}

const audioSpeedPitch: ToolProcessor<AudioSpeedPitchOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'audio_speed_pitch_invalid_input',
      check.errors[0] ?? 'That file could not be used.',
    );
  }
  const file = files[0];
  if (!file) throw new ProcessorError('audio_speed_pitch_invalid_input', 'Choose an audio file first.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing the audio engine' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  let lastRatio = 0.1;
  const onProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
    on_progress?.({ ratio: lastRatio, label: 'Changing speed and pitch' });
  };
  ffmpeg.on('progress', onProgress);

  const extension = fileExtension(file.name) || 'mp3';
  const spec = codecForExtension(extension);
  const inputName = `input.${extension}`;
  const outputName = `output.${spec.extension}`;

  try {
    on_progress?.({ ratio: 0.06, label: 'Reading the audio' });
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    on_progress?.({ ratio: 0.1, label: 'Changing speed and pitch' });
    const code = await ffmpeg.exec(
      buildSpeedPitchArgs(options, extension, inputName, outputName),
      -1,
      { signal },
    );
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      resetFFmpeg();
      throw new ProcessorError(
        'audio_speed_pitch_failed',
        'This file could not be processed in your browser.',
      );
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const mimeType = MIME_BY_EXTENSION[spec.extension] ?? 'audio/mpeg';
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: mimeType });

    const output: ProcessorOutput = {
      artifacts: [
        { file_name: replaceExtension(file.name, spec.extension), mime_type: mimeType, blob },
      ],
    };
    return output;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!(error instanceof ProcessorError)) resetFFmpeg();
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError(
      'audio_speed_pitch_failed',
      'This file could not be processed in your browser.',
      { cause: error },
    );
  } finally {
    ffmpeg.off('progress', onProgress);
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch {
      // Best effort cleanup; a missing file here never affects the result already returned.
    }
  }
};

export default audioSpeedPitch;
