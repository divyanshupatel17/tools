import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { videoRule } from '@/lib/video/video_formats';

export interface GifMakerOptions {
  /** Seconds, source time. Defaults to the whole clip (0 to duration) so leaving the trim
   *  handles untouched turns the complete video into a GIF, same as the tool's landing state. */
  start: number;
  end: number;
  fps: number;
  width: number;
}

const RULE = videoRule();

export const MIN_FPS = 3;
export const MAX_FPS = 30;
export const DEFAULT_FPS = 12;
export const MIN_WIDTH = 100;
export const MAX_WIDTH = 960;
export const DEFAULT_WIDTH = 480;
/** The frame count a slow phone or laptop can still palette-encode in a browser tab without the
 *  tab feeling stuck; past this a person is better served picking a shorter range or fewer fps. */
export const MAX_FRAMES = 600;

function clampFps(fps: number): number {
  return Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(fps)));
}

function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

export function buildGifMakerArgs(
  options: GifMakerOptions,
  inputName: string,
  outputName: string,
): string[] {
  const start = Math.max(0, options.start);
  const end = Math.max(start + 0.1, options.end);
  const fps = clampFps(options.fps);
  const width = clampWidth(options.width);
  return [
    '-ss',
    start.toFixed(3),
    '-to',
    end.toFixed(3),
    '-i',
    inputName,
    '-filter_complex',
    `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
    '-an',
    outputName,
  ];
}

const gifMaker: ToolProcessor<GifMakerOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'gif_maker_invalid_input',
      check.errors[0] ?? 'That file could not be used.',
    );
  }
  const file = files[0];
  if (!file) throw new ProcessorError('gif_maker_invalid_input', 'Choose a video first.');
  if (options.end - options.start < 0.1) {
    throw new ProcessorError('gif_maker_invalid_range', 'Pick a range longer than a tenth of a second.');
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing the converter' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  let lastRatio = 0.1;
  const onProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
    on_progress?.({ ratio: lastRatio, label: 'Rendering the GIF' });
  };
  ffmpeg.on('progress', onProgress);

  const extension = fileExtension(file.name) || 'mp4';
  const inputName = `input.${extension}`;
  const outputName = 'output.gif';

  try {
    on_progress?.({ ratio: 0.06, label: 'Reading the video' });
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    on_progress?.({ ratio: 0.1, label: 'Rendering the GIF' });
    const code = await ffmpeg.exec(buildGifMakerArgs(options, inputName, outputName), -1, {
      signal,
    });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      // See docs/video_tools.md: a fatal WASM trap during one run can otherwise poison every
      // conversion after it in the same tab, so any failed encode resets the shared singleton.
      resetFFmpeg();
      throw new ProcessorError('gif_maker_failed', 'This clip could not be turned into a GIF.');
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'image/gif' });
    return {
      artifacts: [
        { file_name: replaceExtension(file.name, 'gif'), mime_type: 'image/gif', blob },
      ],
    };
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!(error instanceof ProcessorError)) resetFFmpeg();
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError('gif_maker_failed', 'This clip could not be turned into a GIF.', {
      cause: error,
    });
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

export default gifMaker;
