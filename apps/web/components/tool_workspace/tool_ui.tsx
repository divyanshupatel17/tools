'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { ComponentType } from 'react';

function Pending() {
  return (
    <div className="text-muted flex items-center justify-center gap-2 py-16 text-sm">
      <Loader2 aria-hidden className="size-4 animate-spin" />
      Loading the workspace
    </div>
  );
}

/**
 * Tool UIs load on demand, so a page for one tool never ships another tool's code
 * or the libraries behind it.
 */
const WORKSPACES: Record<string, ComponentType> = {
  'pdf.merge-pdf': dynamic(
    () => import('@/features/pdf/merge_pdf/workspace').then((m) => m.MergePdfWorkspace),
    { loading: Pending },
  ),
  'pdf.split-pdf': dynamic(
    () => import('@/features/pdf/split_pdf/workspace').then((m) => m.SplitPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.delete-pages': dynamic(
    () => import('@/features/pdf/delete_pages/workspace').then((m) => m.DeletePagesWorkspace),
    { loading: Pending },
  ),
  'pdf.extract-pages': dynamic(
    () => import('@/features/pdf/extract_pages/workspace').then((m) => m.ExtractPagesWorkspace),
    { loading: Pending },
  ),
  'pdf.rotate-pdf': dynamic(
    () => import('@/features/pdf/rotate_pdf/workspace').then((m) => m.RotatePdfWorkspace),
    { loading: Pending },
  ),
  'pdf.organize-pdf': dynamic(
    () => import('@/features/pdf/organize_pdf/workspace').then((m) => m.OrganizePdfWorkspace),
    { loading: Pending },
  ),
  'pdf.add-page-numbers': dynamic(
    () =>
      import('@/features/pdf/add_page_numbers/workspace').then((m) => m.AddPageNumbersWorkspace),
    { loading: Pending },
  ),
  'pdf.pdf-to-jpg': dynamic(
    () => import('@/features/pdf/pdf_to_jpg/workspace').then((m) => m.PdfToJpgWorkspace),
    { loading: Pending },
  ),
  'pdf.pdf-to-text': dynamic(
    () => import('@/features/pdf/pdf_to_text/workspace').then((m) => m.PdfToTextWorkspace),
    { loading: Pending },
  ),
  'pdf.pdf-to-markdown': dynamic(
    () => import('@/features/pdf/pdf_to_markdown/workspace').then((m) => m.PdfToMarkdownWorkspace),
    { loading: Pending },
  ),
  'pdf.pdf-to-html': dynamic(
    () => import('@/features/pdf/pdf_to_html/workspace').then((m) => m.PdfToHtmlWorkspace),
    { loading: Pending },
  ),
  'pdf.jpg-to-pdf': dynamic(
    () => import('@/features/pdf/jpg_to_pdf/workspace').then((m) => m.JpgToPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.text-to-pdf': dynamic(
    () => import('@/features/pdf/text_to_pdf/workspace').then((m) => m.TextToPdfFeatureWorkspace),
    { loading: Pending },
  ),
  'pdf.markdown-to-pdf': dynamic(
    () => import('@/features/pdf/markdown_to_pdf/workspace').then((m) => m.MarkdownToPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.ipynb-to-pdf': dynamic(
    () => import('@/features/pdf/ipynb_to_pdf/workspace').then((m) => m.IpynbToPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.html-to-pdf': dynamic(
    () => import('@/features/pdf/html_to_pdf/workspace').then((m) => m.HtmlToPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.scan-to-pdf': dynamic(
    () => import('@/features/pdf/scan_to_pdf/workspace').then((m) => m.ScanToPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.compress-pdf': dynamic(
    () => import('@/features/pdf/compress_pdf/workspace').then((m) => m.CompressPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.repair-pdf': dynamic(
    () => import('@/features/pdf/repair_pdf/workspace').then((m) => m.RepairPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.flatten-pdf': dynamic(
    () => import('@/features/pdf/flatten_pdf/workspace').then((m) => m.FlattenPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.remove-metadata': dynamic(
    () => import('@/features/pdf/remove_metadata/workspace').then((m) => m.RemoveMetadataWorkspace),
    { loading: Pending },
  ),
  'pdf.add-watermark': dynamic(
    () => import('@/features/pdf/add_watermark/workspace').then((m) => m.AddWatermarkWorkspace),
    { loading: Pending },
  ),
  'pdf.crop-pdf': dynamic(
    () => import('@/features/pdf/crop_pdf/workspace').then((m) => m.CropPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.pdf-forms': dynamic(
    () => import('@/features/pdf/pdf_forms/workspace').then((m) => m.PdfFormsWorkspace),
    { loading: Pending },
  ),
  'pdf.sign-pdf': dynamic(
    () => import('@/features/pdf/sign_pdf/workspace').then((m) => m.SignPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.redact-pdf': dynamic(
    () => import('@/features/pdf/redact_pdf/workspace').then((m) => m.RedactPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.compare-pdf': dynamic(
    () => import('@/features/pdf/compare_pdf/workspace').then((m) => m.ComparePdfWorkspace),
    { loading: Pending },
  ),
  'pdf.protect-pdf': dynamic(
    () => import('@/features/pdf/protect_pdf/workspace').then((m) => m.ProtectPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.unlock-pdf': dynamic(
    () => import('@/features/pdf/unlock_pdf/workspace').then((m) => m.UnlockPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.word-to-pdf': dynamic(
    () => import('@/features/pdf/word_to_pdf/workspace').then((m) => m.WordToPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.pdf-to-word': dynamic(
    () => import('@/features/pdf/pdf_to_word/workspace').then((m) => m.PdfToWordWorkspace),
    { loading: Pending },
  ),
  'pdf.pdf-to-excel': dynamic(
    () => import('@/features/pdf/pdf_to_excel/workspace').then((m) => m.PdfToExcelWorkspace),
    { loading: Pending },
  ),
  'pdf.excel-to-pdf': dynamic(
    () => import('@/features/pdf/excel_to_pdf/workspace').then((m) => m.ExcelToPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.pdf-to-powerpoint': dynamic(
    () =>
      import('@/features/pdf/pdf_to_powerpoint/workspace').then((m) => m.PdfToPowerpointWorkspace),
    { loading: Pending },
  ),
  'pdf.powerpoint-to-pdf': dynamic(
    () =>
      import('@/features/pdf/powerpoint_to_pdf/workspace').then((m) => m.PowerpointToPdfWorkspace),
    { loading: Pending },
  ),
  'pdf.ocr-pdf': dynamic(
    () => import('@/features/pdf/ocr_pdf/workspace').then((m) => m.OcrPdfWorkspace),
    {
      loading: Pending,
    },
  ),
  'pdf.pdf-to-pdfa': dynamic(
    () => import('@/features/pdf/pdf_to_pdfa/workspace').then((m) => m.PdfToPdfaWorkspace),
    { loading: Pending },
  ),
  'pdf.edit-pdf': dynamic(
    () => import('@/features/pdf/edit_pdf/workspace').then((m) => m.EditPdfWorkspace),
    {
      loading: Pending,
    },
  ),

  'image.compress-image': dynamic(
    () => import('@/features/image/compress_image/workspace').then((m) => m.CompressImageWorkspace),
    { loading: Pending },
  ),
  'image.resize-image': dynamic(
    () => import('@/features/image/resize_image/workspace').then((m) => m.ResizeImageWorkspace),
    { loading: Pending },
  ),
  'image.crop-image': dynamic(
    () => import('@/features/image/crop_image/workspace').then((m) => m.CropImageWorkspace),
    { loading: Pending },
  ),
  'image.rotate-flip-image': dynamic(
    () =>
      import('@/features/image/rotate_flip_image/workspace').then(
        (m) => m.RotateFlipImageWorkspace,
      ),
    { loading: Pending },
  ),
  'image.convert-image': dynamic(
    () => import('@/features/image/convert_image/workspace').then((m) => m.ConvertImageWorkspace),
    { loading: Pending },
  ),
  'image.jpg-to-png': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.JpgToPngWorkspace),
    { loading: Pending },
  ),
  'image.png-to-jpg': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.PngToJpgWorkspace),
    { loading: Pending },
  ),
  'image.jpg-to-webp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.JpgToWebpWorkspace),
    { loading: Pending },
  ),
  'image.webp-to-jpg': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.WebpToJpgWorkspace),
    { loading: Pending },
  ),
  'image.png-to-webp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.PngToWebpWorkspace),
    { loading: Pending },
  ),
  'image.webp-to-png': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.WebpToPngWorkspace),
    { loading: Pending },
  ),
  'image.jpg-to-avif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.JpgToAvifWorkspace),
    { loading: Pending },
  ),
  'image.png-to-avif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.PngToAvifWorkspace),
    { loading: Pending },
  ),
  'image.webp-to-avif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.WebpToAvifWorkspace),
    { loading: Pending },
  ),
  'image.avif-to-jpg': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.AvifToJpgWorkspace),
    { loading: Pending },
  ),
  'image.avif-to-png': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.AvifToPngWorkspace),
    { loading: Pending },
  ),
  'image.svg-to-png': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.SvgToPngWorkspace),
    { loading: Pending },
  ),
  'image.heic-to-jpg': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.HeicToJpgWorkspace),
    { loading: Pending },
  ),
  'image.heic-to-png': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.HeicToPngWorkspace),
    { loading: Pending },
  ),
  'image.tiff-to-jpg': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.TiffToJpgWorkspace),
    { loading: Pending },
  ),
  'image.jpg-to-gif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.JpgToGifWorkspace),
    { loading: Pending },
  ),
  'image.jpg-to-bmp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.JpgToBmpWorkspace),
    { loading: Pending },
  ),
  'image.jpg-to-tiff': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.JpgToTiffWorkspace),
    { loading: Pending },
  ),
  'image.jpg-to-ico': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.JpgToIcoWorkspace),
    { loading: Pending },
  ),
  'image.png-to-gif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.PngToGifWorkspace),
    { loading: Pending },
  ),
  'image.png-to-bmp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.PngToBmpWorkspace),
    { loading: Pending },
  ),
  'image.png-to-tiff': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.PngToTiffWorkspace),
    { loading: Pending },
  ),
  'image.png-to-ico': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.PngToIcoWorkspace),
    { loading: Pending },
  ),
  'image.webp-to-gif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.WebpToGifWorkspace),
    { loading: Pending },
  ),
  'image.webp-to-bmp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.WebpToBmpWorkspace),
    { loading: Pending },
  ),
  'image.webp-to-tiff': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.WebpToTiffWorkspace),
    { loading: Pending },
  ),
  'image.avif-to-webp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.AvifToWebpWorkspace),
    { loading: Pending },
  ),
  'image.avif-to-gif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.AvifToGifWorkspace),
    { loading: Pending },
  ),
  'image.avif-to-bmp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.AvifToBmpWorkspace),
    { loading: Pending },
  ),
  'image.avif-to-tiff': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.AvifToTiffWorkspace),
    { loading: Pending },
  ),
  'image.heic-to-webp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.HeicToWebpWorkspace),
    { loading: Pending },
  ),
  'image.heic-to-avif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.HeicToAvifWorkspace),
    { loading: Pending },
  ),
  'image.tiff-to-png': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.TiffToPngWorkspace),
    { loading: Pending },
  ),
  'image.tiff-to-webp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.TiffToWebpWorkspace),
    { loading: Pending },
  ),
  'image.tiff-to-avif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.TiffToAvifWorkspace),
    { loading: Pending },
  ),
  'image.bmp-to-jpg': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.BmpToJpgWorkspace),
    { loading: Pending },
  ),
  'image.bmp-to-png': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.BmpToPngWorkspace),
    { loading: Pending },
  ),
  'image.bmp-to-webp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.BmpToWebpWorkspace),
    { loading: Pending },
  ),
  'image.bmp-to-avif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.BmpToAvifWorkspace),
    { loading: Pending },
  ),
  'image.gif-to-jpg': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.GifToJpgWorkspace),
    { loading: Pending },
  ),
  'image.gif-to-png': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.GifToPngWorkspace),
    { loading: Pending },
  ),
  'image.gif-to-webp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.GifToWebpWorkspace),
    { loading: Pending },
  ),
  'image.gif-to-avif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.GifToAvifWorkspace),
    { loading: Pending },
  ),
  'image.svg-to-jpg': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.SvgToJpgWorkspace),
    { loading: Pending },
  ),
  'image.svg-to-webp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.SvgToWebpWorkspace),
    { loading: Pending },
  ),
  'image.svg-to-avif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.SvgToAvifWorkspace),
    { loading: Pending },
  ),
  'image.ico-to-png': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.IcoToPngWorkspace),
    { loading: Pending },
  ),
  'image.ico-to-jpg': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.IcoToJpgWorkspace),
    { loading: Pending },
  ),
  'image.ico-to-webp': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.IcoToWebpWorkspace),
    { loading: Pending },
  ),
  'image.ico-to-avif': dynamic(
    () => import('@/features/image/convert_image/presets').then((m) => m.IcoToAvifWorkspace),
    { loading: Pending },
  ),
  'image.image-editor': dynamic(
    () => import('@/features/image/image_editor/workspace').then((m) => m.ImageEditorWorkspace),
    { loading: Pending },
  ),
  'image.watermark-image': dynamic(
    () =>
      import('@/features/image/watermark_image/workspace').then((m) => m.WatermarkImageWorkspace),
    { loading: Pending },
  ),
  'image.meme-generator': dynamic(
    () => import('@/features/image/meme_generator/workspace').then((m) => m.MemeGeneratorWorkspace),
    { loading: Pending },
  ),
  'image.collage-maker': dynamic(
    () => import('@/features/image/collage_maker/workspace').then((m) => m.CollageMakerWorkspace),
    { loading: Pending },
  ),
  'image.screenshot-beautifier': dynamic(
    () =>
      import('@/features/image/screenshot_beautifier/workspace').then(
        (m) => m.ScreenshotBeautifierWorkspace,
      ),
    { loading: Pending },
  ),
  'image.blur-pixelate': dynamic(
    () => import('@/features/image/blur_pixelate/workspace').then((m) => m.BlurPixelateWorkspace),
    { loading: Pending },
  ),
  'image.image-metadata': dynamic(
    () => import('@/features/image/image_metadata/workspace').then((m) => m.ImageMetadataWorkspace),
    { loading: Pending },
  ),
  'image.image-to-text': dynamic(
    () => import('@/features/image/image_to_text/workspace').then((m) => m.ImageToTextWorkspace),
    { loading: Pending },
  ),
  'image.color-extractor': dynamic(
    () =>
      import('@/features/image/color_extractor/workspace').then((m) => m.ColorExtractorWorkspace),
    { loading: Pending },
  ),

  'video.compress-video': dynamic(
    () => import('@/features/video/compress_video/workspace').then((m) => m.CompressVideoWorkspace),
    { loading: Pending },
  ),
  'video.resize-crop-video': dynamic(
    () =>
      import('@/features/video/resize_crop_video/workspace').then(
        (m) => m.ResizeCropVideoWorkspace,
      ),
    { loading: Pending },
  ),
  'video.trim-cut-video': dynamic(
    () => import('@/features/video/trim_cut_video/workspace').then((m) => m.TrimCutVideoWorkspace),
    { loading: Pending },
  ),
  'video.convert-video': dynamic(
    () => import('@/features/video/convert_video/workspace').then((m) => m.ConvertVideoWorkspace),
    { loading: Pending },
  ),
  'video.gif-maker': dynamic(
    () => import('@/features/video/gif_maker/workspace').then((m) => m.GifMakerWorkspace),
    { loading: Pending },
  ),
  'video.screen-recorder': dynamic(
    () => import('@/features/video/screen_recorder/workspace').then((m) => m.ScreenRecorderWorkspace),
    { loading: Pending },
  ),

  'audio.convert-audio': dynamic(
    () => import('@/features/audio/convert_audio/workspace').then((m) => m.ConvertAudioWorkspace),
    { loading: Pending },
  ),
  'audio.compress-audio': dynamic(
    () => import('@/features/audio/compress_audio/workspace').then((m) => m.CompressAudioWorkspace),
    { loading: Pending },
  ),
  'audio.video-to-audio': dynamic(
    () => import('@/features/audio/video_to_audio/workspace').then((m) => m.VideoToAudioWorkspace),
    { loading: Pending },
  ),
  'audio.trim-audio': dynamic(
    () => import('@/features/audio/trim_audio/workspace').then((m) => m.TrimAudioWorkspace),
    { loading: Pending },
  ),
  'audio.merge-audio': dynamic(
    () => import('@/features/audio/merge_audio/workspace').then((m) => m.MergeAudioWorkspace),
    { loading: Pending },
  ),
  'audio.volume-booster': dynamic(
    () => import('@/features/audio/volume_booster/workspace').then((m) => m.VolumeBoosterWorkspace),
    { loading: Pending },
  ),
  'audio.audio-speed-pitch': dynamic(
    () =>
      import('@/features/audio/audio_speed_pitch/workspace').then((m) => m.AudioSpeedPitchWorkspace),
    { loading: Pending },
  ),
  'audio.reverse-audio': dynamic(
    () => import('@/features/audio/reverse_audio/workspace').then((m) => m.ReverseAudioWorkspace),
    { loading: Pending },
  ),
  'audio.voice-recorder': dynamic(
    () => import('@/features/audio/voice_recorder/workspace').then((m) => m.VoiceRecorderWorkspace),
    { loading: Pending },
  ),
  'audio.audio-metadata-editor': dynamic(
    () =>
      import('@/features/audio/audio_metadata_editor/workspace').then(
        (m) => m.AudioMetadataEditorWorkspace,
      ),
    { loading: Pending },
  ),

  'text.word-counter': dynamic(
    () => import('@/features/text/word_counter/workspace').then((m) => m.WordCounterWorkspace),
    { loading: Pending },
  ),
  'text.text-analyzer': dynamic(
    () => import('@/features/text/text_analyzer/workspace').then((m) => m.TextAnalyzerWorkspace),
    { loading: Pending },
  ),
  'text.case-converter': dynamic(
    () => import('@/features/text/case_converter/workspace').then((m) => m.CaseConverterWorkspace),
    { loading: Pending },
  ),
  'text.slug-generator': dynamic(
    () => import('@/features/text/slug_generator/workspace').then((m) => m.SlugGeneratorWorkspace),
    { loading: Pending },
  ),
  'text.text-reverser': dynamic(
    () => import('@/features/text/text_reverser/workspace').then((m) => m.TextReverserWorkspace),
    { loading: Pending },
  ),
  'text.text-sorter': dynamic(
    () => import('@/features/text/text_sorter/workspace').then((m) => m.TextSorterWorkspace),
    { loading: Pending },
  ),
  'text.find-replace': dynamic(
    () => import('@/features/text/find_replace/workspace').then((m) => m.FindReplaceWorkspace),
    { loading: Pending },
  ),
  'text.text-cleaner': dynamic(
    () => import('@/features/text/text_cleaner/workspace').then((m) => m.TextCleanerWorkspace),
    { loading: Pending },
  ),
  'text.line-editor': dynamic(
    () => import('@/features/text/line_editor/workspace').then((m) => m.LineEditorWorkspace),
    { loading: Pending },
  ),
  'text.text-splitter': dynamic(
    () => import('@/features/text/text_splitter/workspace').then((m) => m.TextSplitterWorkspace),
    { loading: Pending },
  ),
  'text.duplicate-lines': dynamic(
    () => import('@/features/text/duplicate_lines/workspace').then((m) => m.DuplicateLinesWorkspace),
    { loading: Pending },
  ),
  'text.text-diff': dynamic(
    () => import('@/features/text/text_diff/workspace').then((m) => m.TextDiffWorkspace),
    { loading: Pending },
  ),
  'text.markdown-formatter': dynamic(
    () => import('@/features/text/markdown_formatter/workspace').then((m) => m.MarkdownFormatterWorkspace),
    { loading: Pending },
  ),

  'developer.code-formatter': dynamic(
    () => import('@/features/developer/code_formatter/workspace').then((m) => m.CodeFormatterWorkspace),
    { loading: Pending },
  ),

  'developer.code-minifier': dynamic(
    () => import('@/features/developer/code_minifier/workspace').then((m) => m.CodeMinifierWorkspace),
    { loading: Pending },
  ),

  'developer.code-diff': dynamic(
    () => import('@/features/developer/code_diff/workspace').then((m) => m.CodeDiffWorkspace),
    { loading: Pending },
  ),

  'developer.json-formatter': dynamic(
    () => import('@/features/developer/json_formatter/workspace').then((m) => m.JsonFormatterWorkspace),
    { loading: Pending },
  ),

  'developer.json-yaml-xml-converter': dynamic(
    () =>
      import('@/features/developer/json_yaml_xml_converter/workspace').then(
        (m) => m.JsonYamlXmlConverterWorkspace,
      ),
    { loading: Pending },
  ),

  'developer.csv-viewer': dynamic(
    () => import('@/features/developer/csv_viewer/workspace').then((m) => m.CsvViewerWorkspace),
    { loading: Pending },
  ),

  'developer.base64-converter': dynamic(
    () =>
      import('@/features/developer/base64_converter/workspace').then((m) => m.Base64ConverterWorkspace),
    { loading: Pending },
  ),

  'developer.html-tools': dynamic(
    () => import('@/features/developer/html_tools/workspace').then((m) => m.HtmlToolsWorkspace),
    { loading: Pending },
  ),

  'developer.url-encoder-decoder': dynamic(
    () =>
      import('@/features/developer/url_encoder_decoder/workspace').then(
        (m) => m.UrlEncoderDecoderWorkspace,
      ),
    { loading: Pending },
  ),

  'developer.url-parser': dynamic(
    () => import('@/features/developer/url_parser/workspace').then((m) => m.UrlParserWorkspace),
    { loading: Pending },
  ),

  'developer.hash-generator': dynamic(
    () => import('@/features/developer/hash_generator/workspace').then((m) => m.HashGeneratorWorkspace),
    { loading: Pending },
  ),

  'developer.jwt-decoder': dynamic(
    () => import('@/features/developer/jwt_decoder/workspace').then((m) => m.JwtDecoderWorkspace),
    { loading: Pending },
  ),

  'developer.uuid-generator': dynamic(
    () => import('@/features/developer/uuid_generator/workspace').then((m) => m.UuidGeneratorWorkspace),
    { loading: Pending },
  ),

  'utilities.stopwatch': dynamic(
    () => import('@/features/utilities/stopwatch/workspace').then((m) => m.StopwatchWorkspace),
    { loading: Pending },
  ),
  'utilities.timer': dynamic(
    () => import('@/features/utilities/timer/workspace').then((m) => m.TimerWorkspace),
    { loading: Pending },
  ),
  'utilities.qr-generator': dynamic(
    () => import('@/features/utilities/qr_generator/workspace').then((m) => m.QrGeneratorWorkspace),
    { loading: Pending },
  ),

  'developer.url-query-string': dynamic(
    () =>
      import('@/features/developer/url_query_string/workspace').then((m) => m.UrlQueryStringWorkspace),
    { loading: Pending },
  ),

  'developer.http-status-codes': dynamic(
    () =>
      import('@/features/developer/http_status_codes/workspace').then((m) => m.HttpStatusCodesWorkspace),
    { loading: Pending },
  ),

  'developer.mime-type-lookup': dynamic(
    () =>
      import('@/features/developer/mime_type_lookup/workspace').then((m) => m.MimeTypeLookupWorkspace),
    { loading: Pending },
  ),

  'developer.random-data-generator': dynamic(
    () =>
      import('@/features/developer/random_data_generator/workspace').then(
        (m) => m.RandomDataGeneratorWorkspace,
      ),
    { loading: Pending },
  ),

  'developer.lorem-ipsum': dynamic(
    () =>
      import('@/features/developer/lorem_ipsum_generator/workspace').then(
        (m) => m.LoremIpsumGeneratorWorkspace,
      ),
    { loading: Pending },
  ),

  'ai.gemini-watermark-remover': dynamic(
    () =>
      import('@/features/ai/gemini_watermark_remover/workspace').then(
        (m) => m.GeminiWatermarkRemoverWorkspace,
      ),
    { loading: Pending },
  ),

  'ai.gemini-video-watermark-remover': dynamic(
    () =>
      import('@/features/ai/gemini_video_watermark_remover/workspace').then(
        (m) => m.GeminiVideoWatermarkRemoverWorkspace,
      ),
    { loading: Pending },
  ),

  'math.calculator': dynamic(
    () => import('@/features/math/calculator/workspace').then((m) => m.CalculatorWorkspace),
    { loading: Pending },
  ),
  'math.scientific-calculator': dynamic(
    () =>
      import('@/features/math/scientific_calculator/workspace').then(
        (m) => m.ScientificCalculatorWorkspace,
      ),
    { loading: Pending },
  ),
};

export function ToolUi({ id }: { id: string }) {
  const Workspace = WORKSPACES[id];
  return Workspace ? <Workspace /> : null;
}
