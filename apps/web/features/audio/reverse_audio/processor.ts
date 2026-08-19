import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { audioRule } from '@/lib/audio/audio_formats';
import { MIME_BY_EXTENSION, codecForExtension } from './formats';

export interface ReverseAudioOptions {
  /** Bitrate for a lossy re-encode, estimated from the source file. Ignored for a lossless
   *  codec. */
  bitrate_kbps: number;
}

const RULE = audioRule();
const MIN_KBPS = 32;
const MAX_KBPS = 320;

export function buildReverseArgs(
  options: ReverseAudioOptions,
  extension: string,
  inputName: string,
  outputName: string,
): string[] {
  const spec = codecForExtension(extension);
  const args = ['-i', inputName, '-af', 'areverse', ...spec.codec];
  const kbps = Math.min(MAX_KBPS, Math.max(MIN_KBPS, Math.round(options.bitrate_kbps || 160)));
  if (!spec.lossless) args.push('-b:a', `${kbps}k`);
  args.push(outputName);
  return args;
}

const reverseAudio: ToolProcessor<ReverseAudioOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'reverse_audio_invalid_input',
      check.errors[0] ?? 'That file could not be used.',
    );
  }
  const file = files[0];
  if (!file) throw new ProcessorError('reverse_audio_invalid_input', 'Choose an audio file first.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing the audio engine' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  let lastRatio = 0.1;
  const onProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
    on_progress?.({ ratio: lastRatio, label: 'Reversing' });
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

    on_progress?.({ ratio: 0.1, label: 'Reversing' });
    const code = await ffmpeg.exec(
      buildReverseArgs(options, extension, inputName, outputName),
      -1,
      { signal },
    );
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      resetFFmpeg();
      throw new ProcessorError(
        'reverse_audio_failed',
        'This file could not be processed in your browser.',
      );
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const mimeType = MIME_BY_EXTENSION[spec.extension] ?? 'audio/mpeg';
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: mimeType });

    const output: ProcessorOutput = {
      artifacts: [
        {
          file_name: replaceExtension(file.name, spec.extension).replace(/(\.[^.]+)$/, '-reversed$1'),
          mime_type: mimeType,
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
      'reverse_audio_failed',
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

export default reverseAudio;
