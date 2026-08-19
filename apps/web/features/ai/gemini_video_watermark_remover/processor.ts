import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { replaceExtension, validateFiles } from '@tools/file_utils';
import { removeGeminiVideoWatermark } from '@/lib/video/gemini_watermark_video';
import { videoRule } from '@/lib/video/video_formats';

export type GeminiVideoWatermarkRemoverOptions = Record<string, never>;

export interface GeminiVideoWatermarkRemoverOutput extends ProcessorOutput {
  /** One entry per input file, in the same order; false where no watermark was found in that file. */
  found: boolean[];
}

const MAX_BYTES = 300 * 1024 * 1024;
const MAX_FILES = 20;
const RULE = videoRule({ max_files: MAX_FILES, max_bytes: MAX_BYTES });

const geminiVideoWatermarkRemover: ToolProcessor<GeminiVideoWatermarkRemoverOptions> = async (
  { files },
  { signal, on_progress },
) => {
  const validation = validateFiles(files, RULE);
  if (!validation.ok) {
    throw new ProcessorError(
      'ai_video_watermark_invalid_input',
      validation.errors[0] ?? 'This file cannot be processed.',
    );
  }
  if (files.length === 0) {
    throw new ProcessorError('ai_video_watermark_no_file', 'Choose a video to remove the watermark from.');
  }

  const artifacts: ProcessorOutput['artifacts'] = [];
  const found: boolean[] = [];
  const total = files.length;

  // Videos decode/encode strictly one at a time: running several WebCodecs pipelines at once
  // would exhaust memory on anything but a short clip.
  for (let index = 0; index < total; index += 1) {
    const file = files[index]!;
    const base = index / total;
    const span = 1 / total;

    try {
      const { blob, found: fileFound } = await removeGeminiVideoWatermark(file, {
        signal,
        onProgress: (ratio, label) =>
          on_progress?.({
            ratio: base + span * ratio,
            label: total > 1 ? `${label} (${index + 1} of ${total})` : label,
          }),
      });

      artifacts.push({ file_name: replaceExtension(file.name, 'mp4'), mime_type: 'video/mp4', blob });
      found.push(fileFound);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ProcessorError(
        'ai_video_watermark_failed',
        error instanceof Error
          ? `${file.name}: ${error.message}`
          : `${file.name} could not be processed.`,
        { cause: error },
      );
    }
  }

  const output: GeminiVideoWatermarkRemoverOutput = { artifacts, found };
  return output;
};

export default geminiVideoWatermarkRemover;
