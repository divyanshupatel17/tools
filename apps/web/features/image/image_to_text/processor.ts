import { replaceExtension, validateFiles } from '@tools/file_utils';
import { ProcessorError, type ProcessorOutput, type ToolProcessor } from '@tools/tool_engine';
import { createCanvas } from '@/lib/image/canvas';
import { decodeImage } from '@/lib/image/decode';
import { imageRule } from '@/lib/image/image_formats';

/** The languages offered in the picker. Tesseract fetches one model per code on first use. */
export const OCR_LANGUAGES: readonly { code: string; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'ara', label: 'Arabic' },
  { code: 'chi_sim', label: 'Chinese, simplified' },
  { code: 'chi_tra', label: 'Chinese, traditional' },
  { code: 'nld', label: 'Dutch' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'hin', label: 'Hindi' },
  { code: 'ita', label: 'Italian' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'kor', label: 'Korean' },
  { code: 'por', label: 'Portuguese' },
  { code: 'rus', label: 'Russian' },
  { code: 'spa', label: 'Spanish' },
];

export interface ImageToTextOptions {
  /** A code from OCR_LANGUAGES. Defaults to English. */
  language?: string;
}

export interface ImageToTextOutput extends ProcessorOutput {
  /** Tesseract's mean confidence for the page, 0 to 100. Absent when it reported none. */
  confidence?: number;
}

const RULE = imageRule({ max_files: 1, max_bytes: 40 * 1024 * 1024 });

// Tesseract's logger reports 0 to 1 within the current phase only; weighting the phases gives
// a single steadily increasing ratio instead of the bar jumping backwards between stages.
const PHASE_ORDER = [
  'loading tesseract core',
  'initializing tesseract',
  'loading language traineddata',
  'initializing api',
  'recognizing text',
] as const;

const PHASE_WEIGHT: Record<string, number> = {
  'loading tesseract core': 0.05,
  'initializing tesseract': 0.05,
  'loading language traineddata': 0.15,
  'initializing api': 0.05,
  'recognizing text': 0.7,
};

/** Tesseract's own status strings name its internals; these are what the user should read. */
const PHASE_LABEL: Record<string, string> = {
  'loading tesseract core': 'Preparing the reader',
  'initializing tesseract': 'Preparing the reader',
  'loading language traineddata': 'Loading the language pack',
  'initializing api': 'Preparing the reader',
  'recognizing text': 'Reading text',
};

function phaseOffset(status: string): number {
  let offset = 0;
  for (const phase of PHASE_ORDER) {
    if (phase === status) return offset;
    offset += PHASE_WEIGHT[phase] ?? 0;
  }
  return offset;
}

const imageToText: ToolProcessor<ImageToTextOptions> = async (
  { files, options },
  { signal, on_progress },
) => {
  const check = validateFiles(files, RULE);
  if (!check.ok) {
    throw new ProcessorError(
      'image_invalid_input',
      check.errors[0] ?? 'That file could not be used.',
    );
  }
  const file = files[0];
  if (!file) throw new ProcessorError('image_invalid_input', 'Choose an image first.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  // Only a code from the published list ever reaches Tesseract's model URL.
  const language = OCR_LANGUAGES.some((entry) => entry.code === options?.language)
    ? options.language!
    : 'eng';

  on_progress?.({ ratio: 0, label: 'Reading the image' });
  const decoded = await decodeImage(file);
  const { canvas, ctx } = createCanvas(decoded.width, decoded.height);
  try {
    ctx.drawImage(decoded.bitmap, 0, 0);
  } finally {
    decoded.bitmap.close();
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  // Same engine as `pdf.ocr-pdf` (lib/pdf/ocr_pdf.ts): tesseract.js runs the WASM recogniser in
  // its own Web Worker, so the main thread stays responsive. That implementation asks for a
  // "sandwich PDF" because it needs a positioned text layer; this tool needs only plain text.
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(language, undefined, {
    logger: (message) => {
      if (typeof message.progress !== 'number') return;
      const weight = PHASE_WEIGHT[message.status] ?? 0;
      const ratio = Math.min(1, phaseOffset(message.status) + message.progress * weight);
      on_progress?.({ ratio, label: PHASE_LABEL[message.status] ?? 'Working' });
    },
  });

  let aborted = false;
  const onAbort = () => {
    aborted = true;
    void worker.terminate();
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    const { data } = await worker.recognize(canvas, {}, { text: true });
    if (aborted || signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const text = data.text ?? '';
    const blob = new Blob([text], { type: 'text/plain' });
    const output: ImageToTextOutput = {
      artifacts: [{ file_name: replaceExtension(file.name, 'txt'), mime_type: 'text/plain', blob }],
      text,
      confidence: typeof data.confidence === 'number' ? data.confidence : undefined,
    };
    return output;
  } catch (error) {
    if (aborted || signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error instanceof ProcessorError) throw error;
    throw new ProcessorError('image_ocr_failed', 'This image could not be scanned for text.', {
      cause: error,
    });
  } finally {
    signal.removeEventListener('abort', onAbort);
    if (!aborted) await worker.terminate();
  }
};

export default imageToText;
