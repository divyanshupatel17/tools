import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, safeFileName, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg } from '@/lib/video/ffmpeg_loader';
import { videoRule } from '@/lib/video/video_formats';

export type TrimCutOutput = 'merge' | 'split';

export interface TrimCutSegment {
  start: number;
  end: number;
}

export interface TrimCutVideoOptions {
  output: TrimCutOutput;
  /** The kept segments only, already in the output order a person chose. */
  segments: TrimCutSegment[];
}

const RULE = videoRule();

function time(value: number): string {
  return Math.max(0, value).toFixed(3);
}

/**
 * One ffmpeg pass: trims each segment, resets its timestamps to start at zero, then concatenates
 * them in the given order. Re-encoding (rather than `-c copy`) is what makes an arbitrary cut
 * point frame accurate instead of snapping to the nearest keyframe. `hasAudio` must match the
 * source: referencing a `[0:a]` stream that doesn't exist (a silent screen recording, a source
 * with video only) makes the whole filter graph fail, not just drop the audio.
 */
export function buildMergeArgs(
  segments: readonly TrimCutSegment[],
  inputName: string,
  outputName: string,
  hasAudio: boolean,
): string[] {
  const filters: string[] = [];
  segments.forEach((segment, index) => {
    filters.push(`[0:v]trim=start=${time(segment.start)}:end=${time(segment.end)},setpts=PTS-STARTPTS[v${index}]`);
    if (hasAudio) {
      filters.push(`[0:a]atrim=start=${time(segment.start)}:end=${time(segment.end)},asetpts=PTS-STARTPTS[a${index}]`);
    }
  });
  const inputs = segments
    .map((_, index) => (hasAudio ? `[v${index}][a${index}]` : `[v${index}]`))
    .join('');
  filters.push(`${inputs}concat=n=${segments.length}:v=1:a=${hasAudio ? 1 : 0}[outv]${hasAudio ? '[outa]' : ''}`);

  const args = [
    '-i',
    inputName,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[outv]',
  ];
  if (hasAudio) args.push('-map', '[outa]');
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
  );
  if (hasAudio) args.push('-c:a', 'aac');
  args.push('-movflags', '+faststart', outputName);
  return args;
}

/** One segment, decoded and re-encoded on its own so its file starts and ends exactly on cut. */
export function buildSplitArgs(
  segment: TrimCutSegment,
  inputName: string,
  outputName: string,
  hasAudio: boolean,
): string[] {
  const args = [
    '-i',
    inputName,
    '-ss',
    time(segment.start),
    '-to',
    time(segment.end),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
  ];
  if (hasAudio) args.push('-c:a', 'aac');
  else args.push('-an');
  args.push('-movflags', '+faststart', outputName);
  return args;
}

/** Whether `inputName` (already written to ffmpeg's virtual filesystem) has an audio stream. */
async function probeHasAudio(
  ffmpeg: Awaited<ReturnType<typeof loadFFmpeg>>,
  inputName: string,
  signal: AbortSignal,
): Promise<boolean> {
  const outputName = `${inputName}.probe.json`;
  try {
    await ffmpeg.ffprobe(
      ['-v', 'error', '-print_format', 'json', '-show_streams', inputName, '-o', outputName],
      -1,
      { signal },
    );
    const raw = await ffmpeg.readFile(outputName, undefined, { signal });
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    const data = JSON.parse(text) as { streams?: { codec_type?: string }[] };
    return (data.streams ?? []).some((stream) => stream.codec_type === 'audio');
  } catch {
    // If probing itself fails, assume audio is present; the real ffmpeg pass below will surface
    // whatever the actual problem is instead of silently guessing wrong.
    return true;
  } finally {
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // Best effort cleanup.
    }
  }
}

const trimCutVideo: ToolProcessor<TrimCutVideoOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'video_invalid_input',
      check.errors[0] ?? 'That file could not be used.',
    );
  }
  const file = files[0];
  if (!file) throw new ProcessorError('video_invalid_input', 'Choose a video first.');
  if (!options.segments || options.segments.length === 0) {
    throw new ProcessorError('video_invalid_input', 'Keep at least one segment before running this.');
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  const extension = fileExtension(file.name) || 'mp4';
  const inputName = `input.${extension}`;
  const baseName = safeFileName(file.name).replace(/\.[^.]+$/, '') || 'video';

  try {
    on_progress?.({ ratio: 0.05, label: 'Reading the video' });
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const hasAudio = await probeHasAudio(ffmpeg, inputName, signal);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    if (options.output === 'split') {
      const artifacts: ProcessorOutput['artifacts'] = [];
      const total = options.segments.length;
      for (let index = 0; index < total; index += 1) {
        const segment = options.segments[index];
        if (!segment) continue;
        const outputName = `output_${index}.mp4`;
        const onProgress = ({ progress }: { progress: number }) => {
          if (!Number.isFinite(progress)) return;
          const ratio = 0.05 + ((index + Math.max(0, progress)) / total) * 0.9;
          on_progress?.({ ratio: Math.min(0.98, ratio), label: `Splitting part ${index + 1} of ${total}` });
        };
        ffmpeg.on('progress', onProgress);
        try {
          const code = await ffmpeg.exec(buildSplitArgs(segment, inputName, outputName, hasAudio), -1, { signal });
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (code !== 0) {
            throw new ProcessorError('video_trim_cut_failed', 'This video could not be split.');
          }
          const data = await ffmpeg.readFile(outputName, undefined, { signal });
          const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
          artifacts.push({ file_name: `${baseName}_part${index + 1}.mp4`, mime_type: 'video/mp4', blob });
        } finally {
          ffmpeg.off('progress', onProgress);
          try {
            await ffmpeg.deleteFile(outputName);
          } catch {
            // Best effort cleanup.
          }
        }
      }
      return { artifacts };
    }

    let lastRatio = 0.1;
    const onProgress = ({ progress }: { progress: number }) => {
      if (!Number.isFinite(progress)) return;
      lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
      on_progress?.({ ratio: lastRatio, label: 'Cutting' });
    };
    ffmpeg.on('progress', onProgress);
    const outputName = 'output.mp4';
    try {
      on_progress?.({ ratio: 0.1, label: 'Cutting' });
      const code = await ffmpeg.exec(buildMergeArgs(options.segments, inputName, outputName, hasAudio), -1, { signal });
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (code !== 0) {
        throw new ProcessorError('video_trim_cut_failed', 'This video could not be cut.');
      }
      const data = await ffmpeg.readFile(outputName, undefined, { signal });
      const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
      return {
        artifacts: [{ file_name: replaceExtension(file.name, 'mp4'), mime_type: 'video/mp4', blob }],
      };
    } finally {
      ffmpeg.off('progress', onProgress);
      try {
        await ffmpeg.deleteFile(outputName);
      } catch {
        // Best effort cleanup.
      }
    }
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError(
      'video_trim_cut_failed',
      options.output === 'split' ? 'This video could not be split.' : 'This video could not be cut.',
      { cause: error },
    );
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      // Best effort cleanup; a leftover input file never affects the result already returned.
    }
  }
};

export default trimCutVideo;
