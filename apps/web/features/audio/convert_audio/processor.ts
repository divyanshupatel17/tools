import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { audioRule } from '@/lib/audio/audio_formats';
import {
  FORMAT_MIME,
  QUALITY_BITRATE_KBPS,
  isLossless,
  type ChannelsOption,
  type ConvertAudioFormat,
  type QualityPreset,
  type SampleRateOption,
} from './formats';

export interface ConvertAudioOptions {
  format: ConvertAudioFormat;
  quality: QualityPreset;
  sample_rate: SampleRateOption;
  channels: ChannelsOption;
  normalize: boolean;
  remove_metadata: boolean;
}

const RULE = audioRule();

interface FormatSpec {
  extension: string;
  codec: string[];
  force_format?: string;
}

const SPECS: Record<ConvertAudioFormat, FormatSpec> = {
  mp3: { extension: 'mp3', codec: ['-c:a', 'libmp3lame'] },
  wav: { extension: 'wav', codec: ['-c:a', 'pcm_s16le'] },
  m4a: { extension: 'm4a', codec: ['-c:a', 'aac'] },
  ogg: { extension: 'ogg', codec: ['-c:a', 'libvorbis'] },
  flac: { extension: 'flac', codec: ['-c:a', 'flac'] },
};

export function convertOutputFileName(name: string, format: ConvertAudioFormat): string {
  return replaceExtension(name, SPECS[format].extension);
}

export function buildConvertArgs(
  options: ConvertAudioOptions,
  inputName: string,
  outputName: string,
): string[] {
  const spec = SPECS[options.format];
  const args = ['-i', inputName];

  if (options.remove_metadata) args.push('-map_metadata', '-1');
  if (options.normalize) args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
  if (options.sample_rate !== 'source') args.push('-ar', String(options.sample_rate));
  if (options.channels !== 'source') args.push('-ac', options.channels === 'mono' ? '1' : '2');

  args.push(...spec.codec);
  if (!isLossless(options.format)) {
    args.push('-b:a', `${QUALITY_BITRATE_KBPS[options.quality]}k`);
  }
  if (spec.force_format) args.push('-f', spec.force_format);
  args.push(outputName);
  return args;
}

const convertAudio: ToolProcessor<ConvertAudioOptions> = async (
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

  const extension = fileExtension(file.name) || 'mp3';
  const inputName = `input.${extension}`;
  const outputName = `output.${SPECS[options.format].extension}`;

  try {
    on_progress?.({ ratio: 0.06, label: 'Reading the audio' });
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    on_progress?.({ ratio: 0.1, label: 'Converting' });
    const code = await ffmpeg.exec(buildConvertArgs(options, inputName, outputName), -1, {
      signal,
    });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      // A nonzero exit here usually means the WASM runtime hit a fatal trap, which leaves the
      // shared singleton unusable for every conversion after this one; reset so the next attempt
      // gets a fresh core instead of failing forever until the page is reloaded.
      resetFFmpeg();
      throw new ProcessorError(
        'audio_convert_failed',
        `This file could not be converted to ${options.format.toUpperCase()} in your browser.`,
      );
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: FORMAT_MIME[options.format] });

    const output: ProcessorOutput = {
      artifacts: [
        {
          file_name: convertOutputFileName(file.name, options.format),
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
      'audio_convert_failed',
      `This file could not be converted to ${options.format.toUpperCase()} in your browser.`,
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

export default convertAudio;
