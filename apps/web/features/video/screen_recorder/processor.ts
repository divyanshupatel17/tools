import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { videoRule } from '@/lib/video/video_formats';

export type RecordingExportFormat = 'webm' | 'mp4' | 'mov' | 'gif';

export interface RecordingExportOptions {
  /** Seconds, source time. Defaults to the whole recording. */
  start: number;
  end: number;
  format: RecordingExportFormat;
}

const RULE = videoRule();

/** A full length GIF of a long recording is both huge and a very slow palette encode; capped the
 *  same way GIF Maker caps it (see features/video/gif_maker/processor.ts). */
export const MAX_GIF_SECONDS = 20;

interface FormatSpec {
  extension: string;
  video: string[];
  audio: string[];
  force_format?: string;
}

const SPECS: Record<Exclude<RecordingExportFormat, 'gif'>, FormatSpec> = {
  webm: {
    extension: 'webm',
    // Re-encoding (not '-c copy') is what makes the trim frame accurate instead of snapping to
    // the nearest keyframe; see trim_cut_video/processor.ts for the same reasoning. VP8 with a
    // fast deadline for the reasons in convert_video/processor.ts (VP9 crashes this WASM core).
    video: ['-c:v', 'libvpx', '-b:v', '3M', '-crf', '10', '-deadline', 'realtime', '-cpu-used', '5'],
    audio: ['-c:a', 'libopus', '-b:a', '128k'],
  },
  mp4: {
    extension: 'mp4',
    video: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p'],
    audio: ['-c:a', 'aac', '-b:a', '160k'],
  },
  mov: {
    extension: 'mov',
    video: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p'],
    audio: ['-c:a', 'aac', '-b:a', '160k'],
  },
};

const FORMAT_MIME: Record<RecordingExportFormat, string> = {
  webm: 'video/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  gif: 'image/gif',
};

function buildGifArgs(start: number, end: number, inputName: string, outputName: string): string[] {
  const cappedEnd = Math.min(end, start + MAX_GIF_SECONDS);
  return [
    '-ss',
    start.toFixed(3),
    '-to',
    cappedEnd.toFixed(3),
    '-i',
    inputName,
    '-filter_complex',
    'fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
    '-an',
    outputName,
  ];
}

export function buildExportArgs(
  options: RecordingExportOptions,
  inputName: string,
  outputName: string,
): string[] {
  const start = Math.max(0, options.start);
  const end = Math.max(start + 0.1, options.end);

  if (options.format === 'gif') return buildGifArgs(start, end, inputName, outputName);

  const spec = SPECS[options.format];
  const args = ['-ss', start.toFixed(3), '-to', end.toFixed(3), '-i', inputName, ...spec.video, ...spec.audio];
  if (spec.force_format) args.push('-f', spec.force_format);
  args.push(outputName);
  return args;
}

export function exportOutputFileName(format: RecordingExportFormat): string {
  const extension = format === 'gif' ? 'gif' : SPECS[format].extension;
  return replaceExtension('recording', extension);
}

const exportRecording: ToolProcessor<RecordingExportOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'screen_recorder_invalid_input',
      check.errors[0] ?? 'That recording could not be used.',
    );
  }
  const file = files[0];
  if (!file) throw new ProcessorError('screen_recorder_invalid_input', 'Record something first.');
  if (options.end - options.start < 0.1) {
    throw new ProcessorError('screen_recorder_invalid_range', 'Pick a range longer than a tenth of a second.');
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing the exporter' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  let lastRatio = 0.1;
  const onProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
    on_progress?.({ ratio: lastRatio, label: 'Exporting' });
  };
  ffmpeg.on('progress', onProgress);

  const extension = fileExtension(file.name) || 'webm';
  const inputName = `input.${extension}`;
  const outputExtension = options.format === 'gif' ? 'gif' : SPECS[options.format].extension;
  const outputName = `output.${outputExtension}`;

  try {
    on_progress?.({ ratio: 0.06, label: 'Reading the recording' });
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    on_progress?.({ ratio: 0.1, label: 'Exporting' });
    const code = await ffmpeg.exec(buildExportArgs(options, inputName, outputName), -1, { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      resetFFmpeg();
      throw new ProcessorError(
        'screen_recorder_export_failed',
        `This recording could not be exported as ${options.format.toUpperCase()}.`,
      );
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: FORMAT_MIME[options.format] });
    return {
      artifacts: [
        { file_name: exportOutputFileName(options.format), mime_type: FORMAT_MIME[options.format], blob },
      ],
    };
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!(error instanceof ProcessorError)) resetFFmpeg();
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError(
      'screen_recorder_export_failed',
      `This recording could not be exported as ${options.format.toUpperCase()}.`,
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

export default exportRecording;
