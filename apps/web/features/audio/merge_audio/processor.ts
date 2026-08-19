import { fetchFile } from '@ffmpeg/util';
import { fileExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { audioRule } from '@/lib/audio/audio_formats';
import { DEFAULT_BITRATE_KBPS, resolveOutputSpec, type JoinMode } from './formats';

export interface MergeAudioOptions {
  /** 0 to 100, aligned to the file order passed to the processor. */
  clip_volumes: number[];
  join_mode: JoinMode;
  join_seconds: number;
}

const MAX_CLIPS = 20;
const RULE = audioRule({ max_files: MAX_CLIPS });

export function mergeOutputFileName(extension: string): string {
  return `merged-audio.${extension}`;
}

export function buildMergeArgs(
  options: MergeAudioOptions,
  inputCount: number,
  outputName: string,
  spec: { codec: string[]; lossless: boolean },
): string[] {
  const n = inputCount;
  const joinSeconds = Math.max(0, options.join_seconds);
  const silentCount = options.join_mode === 'gap' && joinSeconds > 0 ? n - 1 : 0;

  const args: string[] = [];
  const filters: string[] = [];
  const normalized: string[] = [];

  for (let i = 0; i < n; i += 1) {
    const volume = Math.max(0, Math.min(2, (options.clip_volumes[i] ?? 100) / 100));
    filters.push(
      `[${i}:a]volume=${volume},aformat=sample_rates=44100:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`,
    );
    normalized.push(`[a${i}]`);
  }

  for (let i = 0; i < silentCount; i += 1) {
    filters.push(`[${n + i}:a]atrim=duration=${joinSeconds}[g${i}]`);
  }

  let outputLabel: string;

  if (n === 1) {
    outputLabel = normalized[0] ?? '[a0]';
  } else if (options.join_mode === 'gap') {
    if (silentCount > 0) {
      const parts: string[] = [];
      for (let i = 0; i < n; i += 1) {
        parts.push(normalized[i] ?? '');
        if (i < silentCount) parts.push(`[g${i}]`);
      }
      const total = n + silentCount;
      filters.push(`${parts.join('')}concat=n=${total}:v=0:a=1[merged]`);
    } else {
      filters.push(`${normalized.join('')}concat=n=${n}:v=0:a=1[merged]`);
    }
    outputLabel = '[merged]';
  } else if (joinSeconds <= 0) {
    filters.push(`${normalized.join('')}concat=n=${n}:v=0:a=1[merged]`);
    outputLabel = '[merged]';
  } else {
    let base = normalized[0] ?? '[a0]';
    for (let i = 1; i < n; i += 1) {
      const label = `[x${i}]`;
      filters.push(`${base}${normalized[i]}acrossfade=d=${joinSeconds}:c1=tri:c2=tri${label}`);
      base = label;
    }
    outputLabel = base;
  }

  args.push('-filter_complex', filters.join(';'), '-map', outputLabel);
  args.push(...spec.codec);
  if (!spec.lossless) args.push('-b:a', `${DEFAULT_BITRATE_KBPS}k`);
  args.push(outputName);
  return args;
}

const mergeAudio: ToolProcessor<MergeAudioOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'merge_audio_invalid_input',
      check.errors[0] ?? 'Those files could not be used.',
    );
  }
  if (files.length < 2) {
    throw new ProcessorError('merge_audio_invalid_input', 'Add at least two audio files to merge.');
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing the merger' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  let lastRatio = 0.1;
  const onProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
    on_progress?.({ ratio: lastRatio, label: 'Merging' });
  };
  ffmpeg.on('progress', onProgress);

  const extensions = files.map((file) => fileExtension(file.name) || 'mp3');
  const inputNames = files.map((_, index) => `input${index}.${extensions[index]}`);
  const spec = resolveOutputSpec(extensions);
  const outputName = `output.${spec.extension}`;
  const silentCount = options.join_mode === 'gap' && options.join_seconds > 0 ? files.length - 1 : 0;

  const writtenNames: string[] = [];
  try {
    on_progress?.({ ratio: 0.05, label: 'Reading the clips' });
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const name = inputNames[i];
      if (!file || !name) continue;
      await ffmpeg.writeFile(name, await fetchFile(file), { signal });
      writtenNames.push(name);
    }
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const args: string[] = [];
    for (const name of inputNames) args.push('-i', name);
    for (let i = 0; i < silentCount; i += 1) args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
    args.push(...buildMergeArgs(options, files.length, outputName, spec));

    on_progress?.({ ratio: 0.1, label: 'Merging' });
    const code = await ffmpeg.exec(args, -1, { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      resetFFmpeg();
      throw new ProcessorError('merge_audio_failed', 'These files could not be merged in your browser.');
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: spec.mime });

    const output: ProcessorOutput = {
      artifacts: [
        {
          file_name: mergeOutputFileName(spec.extension),
          mime_type: spec.mime,
          blob,
        },
      ],
    };
    return output;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!(error instanceof ProcessorError)) resetFFmpeg();
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError('merge_audio_failed', 'These files could not be merged in your browser.', {
      cause: error,
    });
  } finally {
    ffmpeg.off('progress', onProgress);
    try {
      for (const name of writtenNames) await ffmpeg.deleteFile(name);
      await ffmpeg.deleteFile(outputName);
    } catch {
      // Best effort cleanup; a missing file here never affects the result already returned.
    }
  }
};

export default mergeAudio;
