import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg } from '@/lib/video/ffmpeg_loader';
import { videoRule } from '@/lib/video/video_formats';

export type CompressMode = 'quality' | 'target_size' | 'bitrate';

export interface CompressVideoOptions {
  mode: CompressMode;
  /** 1 to 100, higher keeps more detail and a bigger file. Used when mode is 'quality'. */
  quality?: number;
  /** Megabytes. Used when mode is 'target_size'. */
  target_size_mb?: number;
  /** kbps. Used when mode is 'bitrate'. */
  video_kbps?: number;
  audio_kbps?: number;
  /**
   * Seconds, read client side from the file's own metadata before this runs. Required for the
   * target size math; every other mode ignores it.
   */
  duration_seconds?: number;
}

export interface CompressVideoOutput extends ProcessorOutput {
  /** False when 'target_size' had to fall back to a floor bitrate and could not get close. */
  hit_target: boolean;
}

const RULE = videoRule();

// The CRF range this tool exposes as a 1 to 100 "quality" slider. Lower CRF is higher quality;
// 18 is close to visually lossless for x264, 34 is small but visibly soft.
const MIN_CRF = 18;
const MAX_CRF = 34;
const DEFAULT_AUDIO_KBPS = 128;
const MIN_VIDEO_KBPS = 150;

export function qualityToCrf(quality: number): number {
  const clamped = Math.min(100, Math.max(1, quality));
  return Math.round(MAX_CRF - (clamped / 100) * (MAX_CRF - MIN_CRF));
}

interface BuildResult {
  args: string[];
  hit_target: boolean;
}

export function buildCompressArgs(
  options: CompressVideoOptions,
  inputName: string,
  outputName: string,
): BuildResult {
  const common = [
    '-i',
    inputName,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
  ];

  if (options.mode === 'bitrate') {
    const videoKbps = Math.max(MIN_VIDEO_KBPS, Math.round(options.video_kbps ?? 2000));
    const audioKbps = Math.max(32, Math.round(options.audio_kbps ?? DEFAULT_AUDIO_KBPS));
    return {
      args: [
        ...common,
        '-b:v',
        `${videoKbps}k`,
        '-maxrate',
        `${videoKbps}k`,
        '-bufsize',
        `${videoKbps * 2}k`,
        '-c:a',
        'aac',
        '-b:a',
        `${audioKbps}k`,
        outputName,
      ],
      hit_target: true,
    };
  }

  if (options.mode === 'target_size') {
    const targetBytes = Math.max(0.1, options.target_size_mb ?? 10) * 1024 * 1024;
    const duration = Math.max(1, options.duration_seconds ?? 60);
    const totalKbps = (targetBytes * 8) / duration / 1000;
    const videoKbps = Math.round(totalKbps - DEFAULT_AUDIO_KBPS);
    const clampedVideoKbps = Math.max(MIN_VIDEO_KBPS, videoKbps);
    return {
      args: [
        ...common,
        '-b:v',
        `${clampedVideoKbps}k`,
        '-maxrate',
        `${clampedVideoKbps}k`,
        '-bufsize',
        `${clampedVideoKbps * 2}k`,
        '-c:a',
        'aac',
        '-b:a',
        `${DEFAULT_AUDIO_KBPS}k`,
        outputName,
      ],
      hit_target: videoKbps >= MIN_VIDEO_KBPS,
    };
  }

  const crf = qualityToCrf(options.quality ?? 60);
  return {
    args: [...common, '-crf', String(crf), '-c:a', 'aac', '-b:a', `${DEFAULT_AUDIO_KBPS}k`, outputName],
    hit_target: true,
  };
}

const compressVideo: ToolProcessor<CompressVideoOptions> = async (
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

  const extension = fileExtension(file.name) || 'mp4';
  const inputName = `input.${extension}`;
  const outputName = 'output.mp4';

  try {
    on_progress?.({ ratio: 0.06, label: 'Reading the video' });
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const { args, hit_target } = buildCompressArgs(options, inputName, outputName);
    on_progress?.({ ratio: 0.1, label: 'Compressing' });
    const code = await ffmpeg.exec(args, -1, { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      throw new ProcessorError('video_compress_failed', 'This video could not be compressed.');
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const bytes = data as Uint8Array;
    const blob = new Blob([new Uint8Array(bytes)], { type: 'video/mp4' });

    const output: CompressVideoOutput = {
      artifacts: [
        { file_name: replaceExtension(file.name, 'mp4'), mime_type: 'video/mp4', blob },
      ],
      hit_target,
    };
    return output;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError('video_compress_failed', 'This video could not be compressed.', {
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

export default compressVideo;
