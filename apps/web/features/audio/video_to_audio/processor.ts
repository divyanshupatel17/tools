import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { videoRule } from '@/lib/video/video_formats';
import {
  FORMAT_CODEC,
  FORMAT_MIME,
  QUALITY_BITRATE_KBPS,
  isLossless,
  type ChannelsOption,
  type ExtractFormat,
  type QualityPreset,
  type SampleRateOption,
} from './formats';

export interface VideoToAudioOptions {
  format: ExtractFormat;
  quality: QualityPreset;
  sample_rate: SampleRateOption;
  channels: ChannelsOption;
  start_seconds: number;
  end_seconds: number;
}

const RULE = videoRule();

export function extractOutputFileName(name: string, format: ExtractFormat): string {
  return replaceExtension(name, format);
}

export function buildExtractArgs(
  options: VideoToAudioOptions,
  inputName: string,
  outputName: string,
): string[] {
  const start = Math.max(0, options.start_seconds);
  const duration = Math.max(0.1, options.end_seconds - start);
  const args: string[] = [];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', inputName, '-t', String(duration), '-vn');

  if (options.sample_rate !== 'source') args.push('-ar', String(options.sample_rate));
  if (options.channels !== 'source') args.push('-ac', options.channels === 'mono' ? '1' : '2');

  args.push(...FORMAT_CODEC[options.format]);
  if (!isLossless(options.format)) {
    args.push('-b:a', `${QUALITY_BITRATE_KBPS[options.quality]}k`);
  }
  args.push(outputName);
  return args;
}

const videoToAudio: ToolProcessor<VideoToAudioOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'video_to_audio_invalid_input',
      check.errors[0] ?? 'That file could not be used.',
    );
  }
  const file = files[0];
  if (!file) throw new ProcessorError('video_to_audio_invalid_input', 'Choose a video first.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing the extractor' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  let lastRatio = 0.1;
  const onProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
    on_progress?.({ ratio: lastRatio, label: 'Extracting' });
  };
  ffmpeg.on('progress', onProgress);

  const extension = fileExtension(file.name) || 'mp4';
  const inputName = `input.${extension}`;
  const outputName = `output.${options.format}`;

  try {
    on_progress?.({ ratio: 0.06, label: 'Reading the video' });
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    on_progress?.({ ratio: 0.1, label: 'Extracting' });
    const code = await ffmpeg.exec(buildExtractArgs(options, inputName, outputName), -1, {
      signal,
    });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      resetFFmpeg();
      throw new ProcessorError(
        'video_to_audio_failed',
        `The audio could not be extracted as ${options.format.toUpperCase()} in your browser.`,
      );
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: FORMAT_MIME[options.format] });

    const output: ProcessorOutput = {
      artifacts: [
        {
          file_name: extractOutputFileName(file.name, options.format),
          mime_type: FORMAT_MIME[options.format],
          blob,
        },
      ],
    };
    return output;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!(error instanceof ProcessorError)) resetFFmpeg();
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError(
      'video_to_audio_failed',
      `The audio could not be extracted as ${options.format.toUpperCase()} in your browser.`,
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

export default videoToAudio;
