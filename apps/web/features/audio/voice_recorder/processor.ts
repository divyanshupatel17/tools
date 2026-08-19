import { fetchFile } from '@ffmpeg/util';
import { fileExtension, replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { loadFFmpeg, resetFFmpeg } from '@/lib/video/ffmpeg_loader';
import { audioRule } from '@/lib/audio/audio_formats';

export interface VoiceRecorderOptions {
  /** 32..320. */
  bitrate_kbps: number;
  sample_rate: number;
  channels: 1 | 2;
}

const RULE = audioRule();
const MIN_KBPS = 32;
const MAX_KBPS = 320;
const OUTPUT_MIME = 'audio/mpeg';

/** The recording is always exported as MP3: it's the one container every browser can decode
 *  straight back for the result player, and the raw capture's own container (webm/opus in most
 *  browsers, m4a in Safari) isn't something worth offering as a destination format on its own. */
export function buildVoiceRecorderArgs(
  options: VoiceRecorderOptions,
  inputName: string,
  outputName: string,
): string[] {
  const kbps = Math.min(MAX_KBPS, Math.max(MIN_KBPS, Math.round(options.bitrate_kbps || 128)));
  const channels = options.channels === 2 ? 2 : 1;
  const sampleRate = options.sample_rate > 0 ? Math.round(options.sample_rate) : 44100;
  return [
    '-i',
    inputName,
    '-ar',
    String(sampleRate),
    '-ac',
    String(channels),
    '-c:a',
    'libmp3lame',
    '-b:a',
    `${kbps}k`,
    outputName,
  ];
}

const voiceRecorder: ToolProcessor<VoiceRecorderOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'voice_recorder_invalid_input',
      check.errors[0] ?? 'That recording could not be used.',
    );
  }
  const file = files[0];
  if (!file) throw new ProcessorError('voice_recorder_invalid_input', 'Record something first.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  on_progress?.({ ratio: 0.02, label: 'Preparing the audio engine' });
  const ffmpeg = await loadFFmpeg();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  let lastRatio = 0.1;
  const onProgress = ({ progress }: { progress: number }) => {
    if (!Number.isFinite(progress)) return;
    lastRatio = Math.min(0.98, Math.max(lastRatio, 0.1 + Math.max(0, progress) * 0.88));
    on_progress?.({ ratio: lastRatio, label: 'Encoding' });
  };
  ffmpeg.on('progress', onProgress);

  const extension = fileExtension(file.name) || 'webm';
  const inputName = `input.${extension}`;
  const outputName = 'output.mp3';

  try {
    on_progress?.({ ratio: 0.06, label: 'Reading the recording' });
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    on_progress?.({ ratio: 0.1, label: 'Encoding' });
    const code = await ffmpeg.exec(buildVoiceRecorderArgs(options, inputName, outputName), -1, {
      signal,
    });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (code !== 0) {
      resetFFmpeg();
      throw new ProcessorError(
        'voice_recorder_failed',
        'This recording could not be processed in your browser.',
      );
    }

    const data = await ffmpeg.readFile(outputName, undefined, { signal });
    const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: OUTPUT_MIME });

    const output: ProcessorOutput = {
      artifacts: [
        { file_name: replaceExtension(file.name, 'mp3'), mime_type: OUTPUT_MIME, blob },
      ],
    };
    return output;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!(error instanceof ProcessorError)) resetFFmpeg();
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError(
      'voice_recorder_failed',
      'This recording could not be processed in your browser.',
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

export default voiceRecorder;
