import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { audioRule } from '@/lib/audio/audio_formats';
import { codecForExtension } from './formats';

export interface AudioSegment {
  start: number;
  end: number;
}

export interface TrimAudioOptions {
  /** Kept ranges, in source order, already sorted and non overlapping. Everything outside them
   *  is the cut/deleted material and never reaches the output. */
  segments: AudioSegment[];
  fade_in: boolean;
  fade_out: boolean;
  fade_duration: number;
  /** Bitrate for a lossy re-encode, estimated from the source file so quality is not needlessly
   *  reduced by ffmpeg's own default. Ignored for a lossless codec. */
  bitrate_kbps: number;
}

const RULE = audioRule();
const MIN_SEGMENT_SECONDS = 0.05;

export function trimOutputFileName(name: string, extension: string): string {
  return replaceExtension(name, extension);
}

export function totalKeptDuration(segments: AudioSegment[]): number {
  return segments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0);
}

export function buildTrimArgs(
  options: TrimAudioOptions,
  inputName: string,
  outputName: string,
  extension: string,
): string[] {
  const spec = codecForExtension(extension);
  const segments = options.segments.filter(
    (segment) => segment.end - segment.start > MIN_SEGMENT_SECONDS,
  );
  if (segments.length === 0) throw new ProcessorError('trim_audio_empty', 'Keep at least one section before exporting.');

  const kept = totalKeptDuration(segments);
  const fadeDuration = Math.max(0, Math.min(options.fade_duration, kept / 2));

  const trims = segments
    .map((segment, index) => `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[a${index}]`)
    .join(';');
  const labels = segments.map((_, index) => `[a${index}]`).join('');
  const concat = segments.length > 1 ? `${labels}concat=n=${segments.length}:v=0:a=1[trimmed]` : null;

  const fades: string[] = [];
  if (options.fade_in && fadeDuration > 0) fades.push(`afade=t=in:st=0:d=${fadeDuration}`);
  if (options.fade_out && fadeDuration > 0) {
    fades.push(`afade=t=out:st=${Math.max(0, kept - fadeDuration)}:d=${fadeDuration}`);
  }

  const source = segments.length > 1 ? '[trimmed]' : '[a0]';
  const filterParts = [trims, concat].filter((part): part is string => Boolean(part));

  let outputLabel = source;
  if (fades.length > 0) {
    filterParts.push(`${source}${fades.join(',')}[faded]`);
    outputLabel = '[faded]';
  }

  const args = ['-i', inputName, '-filter_complex', filterParts.join(';'), '-map', outputLabel];
  args.push(...spec.codec);
  if (!spec.lossless) args.push('-b:a', `${options.bitrate_kbps}k`);
  args.push(outputName);
  return args;
}

const trimAudio: ToolProcessor<TrimAudioOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'trim_audio_invalid_input',
      check.errors[0] ?? 'That file could not be used.',
    );
  }
  const file = files[0];
  if (!file) throw new ProcessorError('trim_audio_invalid_input', 'Choose an audio file first.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing the editor' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  let lastRatio = 0.1;
  const onProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
    on_progress?.({ ratio: lastRatio, label: 'Exporting' });
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

    on_progress?.({ ratio: 0.1, label: 'Exporting' });
    const code = await ffmpeg.exec(
      buildTrimArgs(options, inputName, outputName, extension),
      -1,
      { signal },
    );
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      resetFFmpeg();
      throw new ProcessorError(
        'trim_audio_failed',
        'This edit could not be exported in your browser.',
      );
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const mimeByExtension: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      aiff: 'audio/aiff',
    };
    const mimeType = mimeByExtension[spec.extension] ?? 'audio/mpeg';
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: mimeType });

    const output: ProcessorOutput = {
      artifacts: [
        {
          file_name: trimOutputFileName(file.name, spec.extension),
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
      'trim_audio_failed',
      'This edit could not be exported in your browser.',
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

export default trimAudio;
