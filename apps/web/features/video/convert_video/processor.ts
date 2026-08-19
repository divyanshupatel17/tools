import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { videoRule } from '@/lib/video/video_formats';
import { FORMAT_MIME, isAudioFormat, type ConvertVideoFormat } from './formats';

export interface ConvertVideoOptions {
  format: ConvertVideoFormat;
}

export interface ConvertVideoOutput extends ProcessorOutput {
  /** Whether the chosen target has no video stream, so the workspace shows an audio result. */
  is_audio: boolean;
  /**
   * A second, always playable rendition used only for the "after" preview player; the
   * downloadable artifact stays in the format the visitor actually picked. Null when the
   * primary result is already natively playable (no extra work needed) or when generating one
   * failed, in which case the workspace falls back to its own "can't preview this" notice.
   */
  preview: { blob: Blob; mime_type: string } | null;
}

const RULE = videoRule();

/**
 * Per format ffmpeg recipe: which container extension to write, and the video/audio codec args
 * that container expects. `video: null` drops the video stream entirely (`-an` is the audio
 * equivalent); `force_format` is only set where ffmpeg cannot guess the right muxer from the
 * output file's own extension, e.g. `.m4r` looking nothing like the `mp4` muxer it actually is.
 *
 * `preview` says how to make the result playable in the browser's own <video>/<audio> tag:
 * - `native`: the format itself already plays (verified in Chrome against every format below).
 * - `remux`: same codecs as `native` (already H264/AAC), just a container browsers won't open;
 *   repackaging into MP4 with `-c copy` is a near instant, lossless container swap.
 * - `transcode`: the codec itself (mpeg4, wmv2, mpeg2video, wmav2, ac3, pcm in an AIFF shell)
 *   has no browser decoder at all, native or otherwise; only a real re-encode makes it playable,
 *   so this is kept fast and small (ultrafast preset, capped resolution/bitrate) since it exists
 *   purely for the preview pane, never for download.
 */
interface FormatSpec {
  extension: string;
  video: string[] | null;
  audio: string[] | null;
  force_format?: string;
  preview: 'native' | 'remux' | 'transcode';
}

const SPECS: Record<Exclude<ConvertVideoFormat, 'gif'>, FormatSpec> = {
  mp4: {
    extension: 'mp4',
    video: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'],
    audio: ['-c:a', 'aac', '-b:a', '192k'],
    preview: 'native',
  },
  mov: {
    extension: 'mov',
    video: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'],
    audio: ['-c:a', 'aac', '-b:a', '192k'],
    preview: 'native',
  },
  mkv: {
    extension: 'mkv',
    video: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'],
    audio: ['-c:a', 'aac', '-b:a', '192k'],
    preview: 'native',
  },
  ts: {
    extension: 'ts',
    video: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'],
    audio: ['-c:a', 'aac', '-b:a', '192k'],
    force_format: 'mpegts',
    preview: 'remux',
  },
  webm: {
    // VP9 (libvpx-vp9) reliably aborts the single threaded WASM build on anything but a tiny
    // clip; VP8 uses far less memory and stack and is what every ffmpeg.wasm based tool ships.
    // libvpx's own default speed (-cpu-used 0, "best") is a brute force search that is many
    // times slower than realtime even on native hardware; -cpu-used 5 -deadline realtime trades
    // a little quality for the speed a browser tab actually needs.
    extension: 'webm',
    video: ['-c:v', 'libvpx', '-b:v', '2M', '-crf', '10', '-deadline', 'realtime', '-cpu-used', '5'],
    audio: ['-c:a', 'libvorbis', '-q:a', '5'],
    preview: 'native',
  },
  flv: {
    extension: 'flv',
    video: ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p'],
    audio: ['-c:a', 'aac', '-b:a', '128k', '-ar', '44100'],
    preview: 'remux',
  },
  avi: {
    extension: 'avi',
    video: ['-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', '5'],
    audio: ['-c:a', 'libmp3lame', '-b:a', '192k'],
    preview: 'transcode',
  },
  wmv: {
    extension: 'wmv',
    video: ['-c:v', 'wmv2', '-b:v', '2000k'],
    audio: ['-c:a', 'wmav2', '-b:a', '192k'],
    preview: 'transcode',
  },
  mpeg: {
    extension: 'mpg',
    video: ['-c:v', 'mpeg2video', '-b:v', '4000k'],
    audio: ['-c:a', 'mp2', '-b:a', '192k'],
    force_format: 'mpeg',
    preview: 'transcode',
  },
  ogv: {
    extension: 'ogv',
    video: ['-c:v', 'libtheora', '-q:v', '7'],
    audio: ['-c:a', 'libvorbis', '-q:a', '5'],
    preview: 'native',
  },
  '3gp': {
    extension: '3gp',
    video: ['-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p'],
    audio: ['-c:a', 'aac', '-ar', '8000', '-ac', '1'],
    preview: 'native',
  },
  mp3: { extension: 'mp3', video: null, audio: ['-c:a', 'libmp3lame', '-b:a', '192k'], preview: 'native' },
  wav: { extension: 'wav', video: null, audio: ['-c:a', 'pcm_s16le'], preview: 'native' },
  aac: { extension: 'aac', video: null, audio: ['-c:a', 'aac', '-b:a', '192k'], preview: 'native' },
  m4a: { extension: 'm4a', video: null, audio: ['-c:a', 'aac', '-b:a', '192k'], preview: 'native' },
  flac: { extension: 'flac', video: null, audio: ['-c:a', 'flac'], preview: 'native' },
  ogg: { extension: 'ogg', video: null, audio: ['-c:a', 'libvorbis', '-q:a', '5'], preview: 'native' },
  aiff: { extension: 'aiff', video: null, audio: ['-c:a', 'pcm_s16be'], preview: 'transcode' },
  wma: { extension: 'wma', video: null, audio: ['-c:a', 'wmav2', '-b:a', '192k'], preview: 'transcode' },
  ac3: { extension: 'ac3', video: null, audio: ['-c:a', 'ac3', '-b:a', '192k'], preview: 'transcode' },
  m4r: {
    extension: 'm4r',
    video: null,
    audio: ['-c:a', 'aac', '-b:a', '192k'],
    force_format: 'mp4',
    preview: 'native',
  },
};

/** A full length GIF of a long video is both an enormous file and a very slow palette encode;
 *  this tool converts the whole clip for every other format, but GIF is capped to a sane length
 *  the way every other online converter caps it. A custom clip range belongs to GIF Maker. */
export const MAX_GIF_SECONDS = 20;

/** GIF has no audio codec of its own; it needs a two step palette filter, not a plain -c:v. */
function buildGifArgs(inputName: string, outputName: string): string[] {
  return [
    '-t',
    String(MAX_GIF_SECONDS),
    '-i',
    inputName,
    '-filter_complex',
    'fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
    '-an',
    outputName,
  ];
}

export function convertOutputFileName(name: string, format: ConvertVideoFormat): string {
  const extension = format === 'gif' ? 'gif' : SPECS[format].extension;
  return replaceExtension(name, extension);
}

export function buildConvertArgs(
  format: ConvertVideoFormat,
  inputName: string,
  outputName: string,
): string[] {
  if (format === 'gif') return buildGifArgs(inputName, outputName);

  const spec = SPECS[format];
  const args = ['-i', inputName];
  args.push(...(spec.video ?? ['-vn']));
  args.push(...(spec.audio ?? ['-an']));
  if (spec.force_format) args.push('-f', spec.force_format);
  args.push(outputName);
  return args;
}

/** Args for the second, preview only pass; `remux` never touches a pixel or a sample, so it
 *  costs next to nothing regardless of how long the source runs. */
export function buildPreviewArgs(
  strategy: 'remux' | 'transcode',
  isAudio: boolean,
  sourceName: string,
  previewName: string,
): string[] {
  if (strategy === 'remux') {
    return ['-i', sourceName, '-c', 'copy', '-movflags', '+faststart', previewName];
  }
  if (isAudio) {
    return ['-i', sourceName, '-c:a', 'libmp3lame', '-b:a', '128k', previewName];
  }
  return [
    '-i',
    sourceName,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '30',
    '-vf',
    "scale='min(480,iw)':-2",
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-movflags',
    '+faststart',
    previewName,
  ];
}

/**
 * Builds the "after" preview asset when the real result isn't natively playable, reading from
 * `sourceName` (the primary output, still sitting in ffmpeg's virtual filesystem). Never throws:
 * a failed or skipped preview just means the workspace falls back to its own notice, which is
 * strictly worse UX but never worse than the primary conversion, which already succeeded.
 */
async function buildPreview(
  ffmpeg: Awaited<ReturnType<typeof loadFFmpeg>>,
  format: ConvertVideoFormat,
  sourceName: string,
  signal: AbortSignal,
): Promise<{ blob: Blob; mime_type: string } | null> {
  if (format === 'gif') return null;
  const spec = SPECS[format];
  if (spec.preview === 'native') return null;

  const isAudio = isAudioFormat(format);
  const previewName = isAudio ? 'preview.mp3' : 'preview.mp4';
  const mimeType = isAudio ? 'audio/mpeg' : 'video/mp4';

  try {
    const code = await ffmpeg.exec(
      buildPreviewArgs(spec.preview, isAudio, sourceName, previewName),
      -1,
      { signal },
    );
    if (signal.aborted) return null;
    if (code !== 0) {
      // Same fatal-trap risk as the primary encode: a bad preview pass can silently poison the
      // shared singleton, making the *next*, otherwise fine, conversion fail for no visible
      // reason (e.g. a clean format erroring right after an AVI/WMV/WMA run built its preview).
      // Reset here too so a broken preview only ever costs this one preview, never the run after.
      resetFFmpeg();
      return null;
    }
    const data = await ffmpeg.readFile(previewName, undefined, { signal });
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: mimeType });
    return { blob, mime_type: mimeType };
  } catch {
    resetFFmpeg();
    return null;
  } finally {
    try {
      await ffmpeg.deleteFile(previewName);
    } catch {
      // Best effort cleanup; a missing file here never affects the result already returned.
    }
  }
}

const convertVideo: ToolProcessor<ConvertVideoOptions> = async (
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

  on_progress?.({ ratio: 0.02, label: 'Preparing the converter' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  let lastRatio = 0.1;
  const onProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
    on_progress?.({ ratio: lastRatio, label: 'Converting' });
  };
  ffmpeg.on('progress', onProgress);

  const extension = fileExtension(file.name) || 'mp4';
  const inputName = `input.${extension}`;
  const outputExtension = options.format === 'gif' ? 'gif' : SPECS[options.format].extension;
  const outputName = `output.${outputExtension}`;

  try {
    on_progress?.({ ratio: 0.06, label: 'Reading the video' });
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    on_progress?.({ ratio: 0.1, label: 'Converting' });
    const code = await ffmpeg.exec(buildConvertArgs(options.format, inputName, outputName), -1, {
      signal,
    });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      // A nonzero exit here usually means the WASM runtime itself hit a fatal trap (some
      // encoders abort the whole module rather than failing cleanly), which leaves the shared
      // singleton unusable for every conversion after this one. Tear it down so the next attempt
      // gets a fresh core instead of failing forever until the page is reloaded.
      resetFFmpeg();
      throw new ProcessorError(
        'video_convert_failed',
        `This video could not be converted to ${options.format.toUpperCase()} in your browser.`,
      );
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const bytes = data as Uint8Array;
    const blob = new Blob([new Uint8Array(bytes)], { type: FORMAT_MIME[options.format] });

    on_progress?.({ ratio: 0.99, label: 'Preparing preview' });
    const preview = await buildPreview(ffmpeg, options.format, outputName, signal);

    const output: ConvertVideoOutput = {
      artifacts: [
        {
          file_name: convertOutputFileName(file.name, options.format),
          mime_type: FORMAT_MIME[options.format],
          blob,
        },
      ],
      is_audio: isAudioFormat(options.format),
      preview,
    };
    return output;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!(error instanceof ProcessorError)) resetFFmpeg();
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError(
      'video_convert_failed',
      `This video could not be converted to ${options.format.toUpperCase()} in your browser.`,
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

export default convertVideo;
