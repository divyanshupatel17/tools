import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg } from '@/lib/video/ffmpeg_loader';
import { videoRule } from '@/lib/video/video_formats';

export type ResizeCropMode = 'resize' | 'crop';

export interface ResizeCropVideoOptions {
  mode: ResizeCropMode;
  /** Resize target, in pixels. Computed client side so this stays a dumb width/height pair. */
  width?: number;
  height?: number;
  /** Crop rect, in the source's own natural pixels. */
  crop_width?: number;
  crop_height?: number;
  crop_x?: number;
  crop_y?: number;
}

const RULE = videoRule();

/** h264 requires even dimensions; this both rounds and floors to the nearest even number. */
function toEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function buildResizeCropArgs(
  options: ResizeCropVideoOptions,
  inputName: string,
  outputName: string,
): string[] {
  // Lanczos resamples both directions: it is the sharper choice whether the target is smaller
  // than the source (downscale) or, deliberately, larger (upscale) — ffmpeg's own bilinear
  // default softens noticeably more once a video is being scaled up rather than down.
  const filter =
    options.mode === 'crop'
      ? `crop=${toEven(options.crop_width ?? 2)}:${toEven(options.crop_height ?? 2)}:${Math.max(0, Math.round(options.crop_x ?? 0))}:${Math.max(0, Math.round(options.crop_y ?? 0))}`
      : `scale=${toEven(options.width ?? 2)}:${toEven(options.height ?? 2)}:flags=lanczos`;

  return [
    '-i',
    inputName,
    '-vf',
    filter,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    outputName,
  ];
}

const resizeCropVideo: ToolProcessor<ResizeCropVideoOptions> = async (
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
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  let lastRatio = 0.1;
  const onProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
    on_progress?.({ ratio: lastRatio, label: options.mode === 'crop' ? 'Cropping' : 'Resizing' });
  };
  ffmpeg.on('progress', onProgress);

  const extension = fileExtension(file.name) || 'mp4';
  const inputName = `input.${extension}`;
  const outputName = 'output.mp4';

  try {
    on_progress?.({ ratio: 0.06, label: 'Reading the video' });
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const args = buildResizeCropArgs(options, inputName, outputName);
    on_progress?.({ ratio: 0.1, label: options.mode === 'crop' ? 'Cropping' : 'Resizing' });
    const code = await ffmpeg.exec(args, -1, { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      throw new ProcessorError(
        'video_resize_crop_failed',
        options.mode === 'crop' ? 'This video could not be cropped.' : 'This video could not be resized.',
      );
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const bytes = data as Uint8Array;
    const blob = new Blob([new Uint8Array(bytes)], { type: 'video/mp4' });

    const output: ProcessorOutput = {
      artifacts: [
        { file_name: replaceExtension(file.name, 'mp4'), mime_type: 'video/mp4', blob },
      ],
    };
    return output;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError(
      'video_resize_crop_failed',
      options.mode === 'crop' ? 'This video could not be cropped.' : 'This video could not be resized.',
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

export default resizeCropVideo;
