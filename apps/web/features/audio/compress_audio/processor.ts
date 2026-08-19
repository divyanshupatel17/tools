import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { audioRule } from '@/lib/audio/audio_formats';
import {
  FORMAT_CODEC,
  FORMAT_MIME,
  detectCompressFormat,
  type ChannelsOption,
  type CompressAudioFormat,
  type SampleRateOption,
} from './formats';

export type CompressionMode = 'quality' | 'target_size' | 'bitrate';

export interface CompressAudioOptions {
  mode: CompressionMode;
  /** 1 to 100, higher keeps more detail and a bigger file. Used when mode is 'quality'. */
  quality?: number;
  /** Megabytes. Used when mode is 'target_size'. */
  target_size_mb?: number;
  /** kbps. Used when mode is 'bitrate'. */
  bitrate_kbps?: number;
  sample_rate: SampleRateOption;
  channels: ChannelsOption;
  /** Seconds, read client side before this runs. Required for the target size math. */
  duration_seconds?: number;
}

export interface CompressAudioOutput extends ProcessorOutput {
  /** False when 'target_size' had to clamp to the bitrate floor and could not get close. */
  hit_target: boolean;
  resolved_kbps: number;
}

const RULE = audioRule();

const MIN_KBPS = 32;
const MAX_KBPS = 320;

export function qualityToKbps(quality: number): number {
  const clamped = Math.min(100, Math.max(1, quality));
  return Math.round(MIN_KBPS + (clamped / 100) * (MAX_KBPS - MIN_KBPS));
}

interface Resolved {
  kbps: number;
  hit_target: boolean;
}

/** The single source of truth for "what bitrate does this mode actually mean", shared by the
 *  real encode and the workspace's live size estimate so the two numbers never drift apart. */
export function resolveBitrateKbps(options: CompressAudioOptions): Resolved {
  if (options.mode === 'bitrate') {
    const kbps = Math.round(options.bitrate_kbps ?? 160);
    return { kbps: Math.min(MAX_KBPS, Math.max(MIN_KBPS, kbps)), hit_target: true };
  }
  if (options.mode === 'target_size') {
    const targetBytes = Math.max(0.01, options.target_size_mb ?? 5) * 1024 * 1024;
    const duration = Math.max(1, options.duration_seconds ?? 60);
    const kbps = Math.round((targetBytes * 8) / duration / 1000);
    const clamped = Math.min(MAX_KBPS, Math.max(MIN_KBPS, kbps));
    return { kbps: clamped, hit_target: kbps >= MIN_KBPS && kbps <= MAX_KBPS };
  }
  return { kbps: qualityToKbps(options.quality ?? 70), hit_target: true };
}

export function buildCompressArgs(
  options: CompressAudioOptions,
  format: CompressAudioFormat,
  inputName: string,
  outputName: string,
): string[] {
  const args = ['-i', inputName];
  if (options.sample_rate !== 'source') args.push('-ar', String(options.sample_rate));
  if (options.channels !== 'source') args.push('-ac', options.channels === 'mono' ? '1' : '2');
  const { kbps } = resolveBitrateKbps(options);
  args.push(...FORMAT_CODEC[format], '-b:a', `${kbps}k`, outputName);
  return args;
}

const compressAudio: ToolProcessor<CompressAudioOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'audio_invalid_input',
      check.errors[0] ?? 'That file could not be used.',
    );
  }
  const file = files[0];
  if (!file) throw new ProcessorError('audio_invalid_input', 'Choose an audio file first.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing the compressor' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  let lastRatio = 0.1;
  const onProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
    on_progress?.({ ratio: lastRatio, label: 'Compressing' });
  };
  ffmpeg.on('progress', onProgress);

  const extension = fileExtension(file.name) || 'mp3';
  const format = detectCompressFormat(extension);
  const inputName = `input.${extension}`;
  const outputName = `output.${format}`;

  try {
    on_progress?.({ ratio: 0.06, label: 'Reading the audio' });
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const { hit_target, kbps } = resolveBitrateKbps(options);
    on_progress?.({ ratio: 0.1, label: 'Compressing' });
    const code = await ffmpeg.exec(
      buildCompressArgs(options, format, inputName, outputName),
      -1,
      { signal },
    );
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      resetFFmpeg();
      throw new ProcessorError('audio_compress_failed', 'This file could not be compressed in your browser.');
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: FORMAT_MIME[format] });

    const output: CompressAudioOutput = {
      artifacts: [
        { file_name: replaceExtension(file.name, format), mime_type: FORMAT_MIME[format], blob },
      ],
      hit_target,
      resolved_kbps: kbps,
    };
    return output;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!(error instanceof ProcessorError)) resetFFmpeg();
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError(
      'audio_compress_failed',
      'This file could not be compressed in your browser.',
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

export default compressAudio;
