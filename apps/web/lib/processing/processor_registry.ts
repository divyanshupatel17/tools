import type { ToolProcessor } from '@tools/tool_engine';
import { logToolError, logToolUsed } from '@/lib/firebase/tool_events';

/**
 * A processor with its options type erased. Each implementation declares its own options
 * interface, and a `ToolProcessor<CropImageOptions>` is not assignable to a
 * `ToolProcessor<Record<string, unknown>>` because function parameters are contravariant.
 * The erasure stops at this boundary: callers still build the concrete options their own
 * tool documents, checked against that tool's interface.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolProcessor = ToolProcessor<any>;

type ProcessorLoader = () => Promise<{ default: AnyToolProcessor }>;

/**
 * Maps a tool's `processor` id to a dynamic import of its implementation.
 * Entries must stay lazy — importing a processor here eagerly would pull heavy
 * libraries (pdf-lib, FFmpeg, WASM) into the initial bundle.
 */
export const PROCESSORS: Record<string, ProcessorLoader> = {
  'pdf.merge-pdf': () => import('@/features/pdf/merge_pdf/processor'),
  'pdf.split-pdf': () => import('@/features/pdf/split_pdf/processor'),
  'pdf.delete-pages': () => import('@/features/pdf/delete_pages/processor'),
  'pdf.extract-pages': () => import('@/features/pdf/extract_pages/processor'),
  'pdf.rotate-pdf': () => import('@/features/pdf/rotate_pdf/processor'),
  'pdf.organize-pdf': () => import('@/features/pdf/organize_pdf/processor'),
  'pdf.add-page-numbers': () => import('@/features/pdf/add_page_numbers/processor'),
  'pdf.pdf-to-jpg': () => import('@/features/pdf/pdf_to_jpg/processor'),
  'pdf.pdf-to-text': () => import('@/features/pdf/pdf_to_text/processor'),
  'pdf.pdf-to-markdown': () => import('@/features/pdf/pdf_to_markdown/processor'),
  'pdf.pdf-to-html': () => import('@/features/pdf/pdf_to_html/processor'),
  'pdf.jpg-to-pdf': () => import('@/features/pdf/jpg_to_pdf/processor'),
  'pdf.text-to-pdf': () => import('@/features/pdf/text_to_pdf/processor'),
  'pdf.markdown-to-pdf': () => import('@/features/pdf/markdown_to_pdf/processor'),
  'pdf.ipynb-to-pdf': () => import('@/features/pdf/ipynb_to_pdf/processor'),
  'pdf.html-to-pdf': () => import('@/features/pdf/html_to_pdf/processor'),
  'pdf.scan-to-pdf': () => import('@/features/pdf/scan_to_pdf/processor'),
  'pdf.compress-pdf': () => import('@/features/pdf/compress_pdf/processor'),
  'pdf.repair-pdf': () => import('@/features/pdf/repair_pdf/processor'),
  'pdf.flatten-pdf': () => import('@/features/pdf/flatten_pdf/processor'),
  'pdf.remove-metadata': () => import('@/features/pdf/remove_metadata/processor'),
  'pdf.add-watermark': () => import('@/features/pdf/add_watermark/processor'),
  'pdf.crop-pdf': () => import('@/features/pdf/crop_pdf/processor'),
  'pdf.pdf-forms': () => import('@/features/pdf/pdf_forms/processor'),
  'pdf.sign-pdf': () => import('@/features/pdf/sign_pdf/processor'),
  'pdf.redact-pdf': () => import('@/features/pdf/redact_pdf/processor'),
  'pdf.compare-pdf': () => import('@/features/pdf/compare_pdf/processor'),
  'pdf.protect-pdf': () => import('@/features/pdf/protect_pdf/processor'),
  'pdf.unlock-pdf': () => import('@/features/pdf/unlock_pdf/processor'),
  'pdf.word-to-pdf': () => import('@/features/pdf/word_to_pdf/processor'),
  'pdf.pdf-to-word': () => import('@/features/pdf/pdf_to_word/processor'),
  'pdf.pdf-to-excel': () => import('@/features/pdf/pdf_to_excel/processor'),
  'pdf.excel-to-pdf': () => import('@/features/pdf/excel_to_pdf/processor'),
  'pdf.pdf-to-powerpoint': () => import('@/features/pdf/pdf_to_powerpoint/processor'),
  'pdf.powerpoint-to-pdf': () => import('@/features/pdf/powerpoint_to_pdf/processor'),
  'pdf.ocr-pdf': () => import('@/features/pdf/ocr_pdf/processor'),
  'pdf.pdf-to-pdfa': () => import('@/features/pdf/pdf_to_pdfa/processor'),
  'pdf.edit-pdf': () => import('@/features/pdf/edit_pdf/processor'),

  // Every image.*-to-* route shares the Convert Image processor; the target format arrives via options.
  'image.compress-image': () => import('@/features/image/compress_image/processor'),
  'image.resize-image': () => import('@/features/image/resize_image/processor'),
  'image.crop-image': () => import('@/features/image/crop_image/processor'),
  'image.rotate-flip-image': () => import('@/features/image/rotate_flip_image/processor'),
  'image.convert-image': () => import('@/features/image/convert_image/processor'),
  'image.jpg-to-png': () => import('@/features/image/convert_image/processor'),
  'image.png-to-jpg': () => import('@/features/image/convert_image/processor'),
  'image.jpg-to-webp': () => import('@/features/image/convert_image/processor'),
  'image.webp-to-jpg': () => import('@/features/image/convert_image/processor'),
  'image.png-to-webp': () => import('@/features/image/convert_image/processor'),
  'image.webp-to-png': () => import('@/features/image/convert_image/processor'),
  'image.jpg-to-avif': () => import('@/features/image/convert_image/processor'),
  'image.png-to-avif': () => import('@/features/image/convert_image/processor'),
  'image.webp-to-avif': () => import('@/features/image/convert_image/processor'),
  'image.avif-to-jpg': () => import('@/features/image/convert_image/processor'),
  'image.avif-to-png': () => import('@/features/image/convert_image/processor'),
  'image.svg-to-png': () => import('@/features/image/convert_image/processor'),
  'image.heic-to-jpg': () => import('@/features/image/convert_image/processor'),
  'image.heic-to-png': () => import('@/features/image/convert_image/processor'),
  'image.tiff-to-jpg': () => import('@/features/image/convert_image/processor'),
  'image.jpg-to-gif': () => import('@/features/image/convert_image/processor'),
  'image.jpg-to-bmp': () => import('@/features/image/convert_image/processor'),
  'image.jpg-to-tiff': () => import('@/features/image/convert_image/processor'),
  'image.jpg-to-ico': () => import('@/features/image/convert_image/processor'),
  'image.png-to-gif': () => import('@/features/image/convert_image/processor'),
  'image.png-to-bmp': () => import('@/features/image/convert_image/processor'),
  'image.png-to-tiff': () => import('@/features/image/convert_image/processor'),
  'image.png-to-ico': () => import('@/features/image/convert_image/processor'),
  'image.webp-to-gif': () => import('@/features/image/convert_image/processor'),
  'image.webp-to-bmp': () => import('@/features/image/convert_image/processor'),
  'image.webp-to-tiff': () => import('@/features/image/convert_image/processor'),
  'image.avif-to-webp': () => import('@/features/image/convert_image/processor'),
  'image.avif-to-gif': () => import('@/features/image/convert_image/processor'),
  'image.avif-to-bmp': () => import('@/features/image/convert_image/processor'),
  'image.avif-to-tiff': () => import('@/features/image/convert_image/processor'),
  'image.heic-to-webp': () => import('@/features/image/convert_image/processor'),
  'image.heic-to-avif': () => import('@/features/image/convert_image/processor'),
  'image.tiff-to-png': () => import('@/features/image/convert_image/processor'),
  'image.tiff-to-webp': () => import('@/features/image/convert_image/processor'),
  'image.tiff-to-avif': () => import('@/features/image/convert_image/processor'),
  'image.bmp-to-jpg': () => import('@/features/image/convert_image/processor'),
  'image.bmp-to-png': () => import('@/features/image/convert_image/processor'),
  'image.bmp-to-webp': () => import('@/features/image/convert_image/processor'),
  'image.bmp-to-avif': () => import('@/features/image/convert_image/processor'),
  'image.gif-to-jpg': () => import('@/features/image/convert_image/processor'),
  'image.gif-to-png': () => import('@/features/image/convert_image/processor'),
  'image.gif-to-webp': () => import('@/features/image/convert_image/processor'),
  'image.gif-to-avif': () => import('@/features/image/convert_image/processor'),
  'image.svg-to-jpg': () => import('@/features/image/convert_image/processor'),
  'image.svg-to-webp': () => import('@/features/image/convert_image/processor'),
  'image.svg-to-avif': () => import('@/features/image/convert_image/processor'),
  'image.ico-to-png': () => import('@/features/image/convert_image/processor'),
  'image.ico-to-jpg': () => import('@/features/image/convert_image/processor'),
  'image.ico-to-webp': () => import('@/features/image/convert_image/processor'),
  'image.ico-to-avif': () => import('@/features/image/convert_image/processor'),
  'image.image-editor': () => import('@/features/image/image_editor/processor'),
  'image.watermark-image': () => import('@/features/image/watermark_image/processor'),
  'image.meme-generator': () => import('@/features/image/meme_generator/processor'),
  'image.collage-maker': () => import('@/features/image/collage_maker/processor'),
  'image.screenshot-beautifier': () => import('@/features/image/screenshot_beautifier/processor'),
  'image.blur-pixelate': () => import('@/features/image/blur_pixelate/processor'),
  'image.image-metadata': () => import('@/features/image/image_metadata/processor'),
  'image.image-to-text': () => import('@/features/image/image_to_text/processor'),
  'image.color-extractor': () => import('@/features/image/color_extractor/processor'),

  'video.compress-video': () => import('@/features/video/compress_video/processor'),
  'video.resize-crop-video': () => import('@/features/video/resize_crop_video/processor'),
  'video.trim-cut-video': () => import('@/features/video/trim_cut_video/processor'),
  'video.convert-video': () => import('@/features/video/convert_video/processor'),
  'video.gif-maker': () => import('@/features/video/gif_maker/processor'),
  'video.screen-recorder': () => import('@/features/video/screen_recorder/processor'),

  'audio.convert-audio': () => import('@/features/audio/convert_audio/processor'),
  'audio.compress-audio': () => import('@/features/audio/compress_audio/processor'),
  'audio.video-to-audio': () => import('@/features/audio/video_to_audio/processor'),
  'audio.trim-audio': () => import('@/features/audio/trim_audio/processor'),
  'audio.merge-audio': () => import('@/features/audio/merge_audio/processor'),
  'audio.volume-booster': () => import('@/features/audio/volume_booster/processor'),
  'audio.audio-speed-pitch': () => import('@/features/audio/audio_speed_pitch/processor'),
  'audio.reverse-audio': () => import('@/features/audio/reverse_audio/processor'),
  'audio.voice-recorder': () => import('@/features/audio/voice_recorder/processor'),
  'audio.audio-metadata-editor': () => import('@/features/audio/audio_metadata_editor/processor'),

  'text.word-counter': () => import('@/features/text/word_counter/processor'),
  'text.text-analyzer': () => import('@/features/text/text_analyzer/processor'),
  'text.case-converter': () => import('@/features/text/case_converter/processor'),
  'text.slug-generator': () => import('@/features/text/slug_generator/processor'),
  'text.text-reverser': () => import('@/features/text/text_reverser/processor'),
  'text.text-sorter': () => import('@/features/text/text_sorter/processor'),
  'text.find-replace': () => import('@/features/text/find_replace/processor'),
  'text.text-cleaner': () => import('@/features/text/text_cleaner/processor'),
  'text.line-editor': () => import('@/features/text/line_editor/processor'),
  'text.text-splitter': () => import('@/features/text/text_splitter/processor'),
  'text.duplicate-lines': () => import('@/features/text/duplicate_lines/processor'),
  'text.text-diff': () => import('@/features/text/text_diff/processor'),
  'text.markdown-formatter': () => import('@/features/text/markdown_formatter/processor'),

  'developer.code-formatter': () => import('@/features/developer/code_formatter/processor'),
  'developer.code-minifier': () => import('@/features/developer/code_minifier/processor'),
  'developer.code-diff': () => import('@/features/developer/code_diff/processor'),
  'developer.json-formatter': () => import('@/features/developer/json_formatter/processor'),
  'developer.json-yaml-xml-converter': () =>
    import('@/features/developer/json_yaml_xml_converter/processor'),
  'developer.csv-viewer': () => import('@/features/developer/csv_viewer/processor'),
  'developer.base64-converter': () => import('@/features/developer/base64_converter/processor'),
  'developer.html-tools': () => import('@/features/developer/html_tools/processor'),
  'developer.url-encoder-decoder': () => import('@/features/developer/url_encoder_decoder/processor'),
  'developer.url-parser': () => import('@/features/developer/url_parser/processor'),
  'developer.hash-generator': () => import('@/features/developer/hash_generator/processor'),
  'developer.jwt-decoder': () => import('@/features/developer/jwt_decoder/processor'),
  'developer.uuid-generator': () => import('@/features/developer/uuid_generator/processor'),
  'developer.url-query-string': () => import('@/features/developer/url_query_string/processor'),
  'developer.http-status-codes': () => import('@/features/developer/http_status_codes/processor'),
  'developer.mime-type-lookup': () => import('@/features/developer/mime_type_lookup/processor'),
  'developer.random-data-generator': () => import('@/features/developer/random_data_generator/processor'),
  'developer.lorem-ipsum': () => import('@/features/developer/lorem_ipsum_generator/processor'),

  'utilities.stopwatch': () => import('@/features/utilities/stopwatch/processor'),
  'utilities.timer': () => import('@/features/utilities/timer/processor'),
  'utilities.qr-generator': () => import('@/features/utilities/qr_generator/processor'),

  'ai.gemini-watermark-remover': () => import('@/features/ai/gemini_watermark_remover/processor'),
  'ai.gemini-video-watermark-remover': () =>
    import('@/features/ai/gemini_video_watermark_remover/processor'),

  'math.calculator': () => import('@/features/math/calculator/processor'),
  'math.scientific-calculator': () => import('@/features/math/scientific_calculator/processor'),
  'math.graphing-calculator': () => import('@/features/math/graphing_calculator/processor'),
  'math.programmer-calculator': () => import('@/features/math/programmer_calculator/processor'),
  'math.matrix-calculator': () => import('@/features/math/matrix_calculator/processor'),
  'math.3d-graphing-calculator': () => import('@/features/math/graphing_calculator_3d/processor'),
};

export function hasProcessor(id: string): boolean {
  return id in PROCESSORS;
}

/**
 * Loads a tool's implementation and wraps it so every one of its ~165 call sites gets
 * `tool_used`/`tool_error` analytics for free, instead of each workspace instrumenting its
 * own try/catch around the processor call.
 */
export async function loadProcessor(id: string): Promise<ToolProcessor> {
  const loader = PROCESSORS[id];
  if (!loader) throw new Error(`No processor registered for "${id}"`);
  const loaded = await loader();
  const processor = loaded.default;

  logToolUsed(id);

  return async (input, context) => {
    try {
      return await processor(input, context);
    } catch (error) {
      // A user cancelling (AbortController) is not a failure worth counting as an error.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        logToolError(id, error);
      }
      throw error;
    }
  };
}
