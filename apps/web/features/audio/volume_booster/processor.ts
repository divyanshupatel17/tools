import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { audioRule } from '@/lib/audio/audio_formats';
import { MIME_BY_EXTENSION, codecForExtension, type LufsPreset } from './formats';

export interface VolumeBoosterOptions {
  /** 0..500, 100 is unity. Stacks multiplicatively with gain_db. */
  volume_percent: number;
  /** -20..+20 dB, 0 is unity. Stacks multiplicatively with volume_percent. */
  gain_db: number;
  /** When true, loudnorm to target_lufs replaces volume_percent/gain_db entirely rather than
   *  stacking with them, since normalizing to an absolute loudness makes a manual multiplier
   *  meaningless. */
  normalize: boolean;
  target_lufs: LufsPreset;
  /** Bitrate for a lossy re-encode, estimated from the source file so this never needlessly
   *  drops quality below what the source already had. Ignored for a lossless codec. */
  bitrate_kbps: number;
}

const RULE = audioRule();
const MIN_KBPS = 32;
const MAX_KBPS = 320;

/** The single source of truth for "what multiplier does this option set actually apply", shared
 *  by the real encode and the workspace's own clipping headroom math. */
export function resolveGainFactor(options: Pick<VolumeBoosterOptions, 'volume_percent' | 'gain_db'>): number {
  const volumeFactor = Math.max(0, options.volume_percent) / 100;
  const dbFactor = 10 ** (options.gain_db / 20);
  return volumeFactor * dbFactor;
}

export function buildVolumeArgs(
  options: VolumeBoosterOptions,
  extension: string,
  inputName: string,
  outputName: string,
): string[] {
  const spec = codecForExtension(extension);
  const args = ['-i', inputName];

  if (options.normalize) {
    args.push('-af', `loudnorm=I=${options.target_lufs}:TP=-1.5:LRA=11`);
  } else {
    const factor = resolveGainFactor(options);
    args.push('-af', `volume=${factor}`);
  }

  args.push(...spec.codec);
  const kbps = Math.min(MAX_KBPS, Math.max(MIN_KBPS, Math.round(options.bitrate_kbps || 160)));
  if (!spec.lossless) args.push('-b:a', `${kbps}k`);
  args.push(outputName);
  return args;
}

const volumeBooster: ToolProcessor<VolumeBoosterOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'volume_booster_invalid_input',
      check.errors[0] ?? 'That file could not be used.',
    );
  }
  const file = files[0];
  if (!file) throw new ProcessorError('volume_booster_invalid_input', 'Choose an audio file first.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing the audio engine' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  let lastRatio = 0.1;
  const onProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
    on_progress?.({ ratio: lastRatio, label: options.normalize ? 'Normalizing' : 'Adjusting volume' });
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

    on_progress?.({ ratio: 0.1, label: options.normalize ? 'Normalizing' : 'Adjusting volume' });
    const code = await ffmpeg.exec(
      buildVolumeArgs(options, extension, inputName, outputName),
      -1,
      { signal },
    );
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      resetFFmpeg();
      throw new ProcessorError(
        'volume_booster_failed',
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
      'volume_booster_failed',
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

export default volumeBooster;
