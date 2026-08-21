import { TOOL_CATEGORIES } from './categories';
import type {
  Tool,
  ToolAccent,
  ToolCategoryId,
  ToolMediaType,
  ToolSeo,
  ToolStatus,
} from './tool_types';

interface ToolDraft {
  slug: string;
  section?: string;
  name: string;
  description: string;
  icon: string;
  accent?: ToolAccent;
  input_types: readonly ToolMediaType[];
  output_types: readonly ToolMediaType[];
  client_only?: boolean;
  worker_required?: boolean;
  multiple_files?: boolean;
  popular?: boolean;
  popular_rank?: number;
  status?: ToolStatus;
  seo?: Partial<ToolSeo>;
}

function define(category: ToolCategoryId, drafts: readonly ToolDraft[]): Tool[] {
  return drafts.map((draft) => ({
    slug: draft.slug,
    category,
    ...(draft.section ? { section: draft.section } : {}),
    name: draft.name,
    description: draft.description,
    icon: draft.icon,
    ...(draft.accent ? { accent: draft.accent } : {}),
    processor: `${category}.${draft.slug}`,
    input_types: draft.input_types,
    output_types: draft.output_types,
    client_only: draft.client_only ?? true,
    worker_required: draft.worker_required ?? false,
    multiple_files: draft.multiple_files ?? false,
    popular: draft.popular ?? false,
    ...(draft.popular_rank !== undefined ? { popular_rank: draft.popular_rank } : {}),
    status: draft.status ?? 'planned',
    seo: {
      title: draft.seo?.title ?? draft.name,
      description: draft.seo?.description ?? draft.description,
      ...(draft.seo?.keywords ? { keywords: draft.seo.keywords } : {}),
    },
  }));
}

const PDF_TOOLS = define('pdf', [
  // 1. Organize
  {
    slug: 'merge-pdf',
    section: 'organize',
    name: 'Merge PDF',
    description: 'Combine several PDF files into one document and reorder them before saving.',
    icon: 'Combine',
    popular: true,
    popular_rank: 1,
    input_types: ['pdf'],
    output_types: ['pdf'],
    multiple_files: true,
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'split-pdf',
    section: 'organize',
    name: 'Split PDF',
    description:
      'Break a PDF into separate documents by page range or split every page into its own file.',
    icon: 'Scissors',
    popular: true,
    popular_rank: 6,
    input_types: ['pdf'],
    output_types: ['pdf', 'archive'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'delete-pages',
    section: 'organize',
    name: 'Remove Pages',
    description: 'Delete the pages you do not want and download the shortened document.',
    icon: 'FileMinus',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'extract-pages',
    section: 'organize',
    name: 'Extract Pages',
    description:
      'Pull selected pages out of a PDF into a new document, leaving the original alone.',
    icon: 'FileOutput',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'organize-pdf',
    section: 'organize',
    name: 'Organize PDF',
    description: 'Reorder, rotate and delete pages on one screen, then export the rebuilt PDF.',
    icon: 'LayoutGrid',
    input_types: ['pdf'],
    output_types: ['pdf'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'scan-to-pdf',
    section: 'organize',
    name: 'Scan to PDF',
    description: 'Photograph pages with your camera and save them straight into a single PDF.',
    icon: 'ScanLine',
    input_types: ['image'],
    output_types: ['pdf'],
    multiple_files: true,
    status: 'available',
  },

  // 2. Optimize
  {
    slug: 'compress-pdf',
    section: 'optimize',
    name: 'Compress PDF',
    description:
      'Reduce PDF file size while keeping the document readable and the text selectable.',
    icon: 'Minimize2',
    accent: 'developer',
    popular: true,
    popular_rank: 2,
    input_types: ['pdf'],
    output_types: ['pdf'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'repair-pdf',
    section: 'optimize',
    name: 'Repair PDF',
    description: 'Rebuild a damaged PDF so it opens again, recovering whatever is still readable.',
    icon: 'Wrench',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'ocr-pdf',
    section: 'optimize',
    name: 'OCR PDF',
    description: 'Recognise the text in a scanned PDF so it can be searched, selected and copied.',
    icon: 'ScanText',
    input_types: ['pdf'],
    output_types: ['pdf', 'text'],
    status: 'available',
  },
  {
    slug: 'flatten-pdf',
    section: 'optimize',
    name: 'Flatten PDF',
    description:
      'Bake form fields, annotations and layers into the page so they can no longer be edited.',
    icon: 'Layers',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },

  // 3. Convert to PDF. Slugs keep the format people search for; names say what the tool covers.
  {
    slug: 'jpg-to-pdf',
    section: 'convert-to',
    name: 'Images to PDF',
    description: 'Turn JPG, PNG, WebP, GIF and BMP files into one PDF, with page size and margins.',
    icon: 'ImagePlus',
    accent: 'audio',
    popular: true,
    popular_rank: 5,
    input_types: ['image'],
    output_types: ['pdf'],
    multiple_files: true,
    status: 'available',
    seo: { title: 'JPG to PDF' },
  },
  {
    slug: 'word-to-pdf',
    section: 'convert-to',
    name: 'Word to PDF',
    description: 'Lay a DOCX document out as a PDF, text, headings, lists and tables included.',
    icon: 'FileText',
    input_types: ['document'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'powerpoint-to-pdf',
    section: 'convert-to',
    name: 'PowerPoint to PDF',
    description: 'Lay the text from each slide out on its own PDF page, in slide order.',
    icon: 'Presentation',
    input_types: ['document'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'excel-to-pdf',
    section: 'convert-to',
    name: 'Excel to PDF',
    description:
      'Lay the first sheet of an XLSX workbook out as a table across as many pages as it needs.',
    icon: 'Table',
    input_types: ['document'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'html-to-pdf',
    section: 'convert-to',
    name: 'HTML to PDF',
    description: 'Render pasted HTML into a paginated PDF with your choice of page size.',
    icon: 'Code',
    input_types: ['text'],
    output_types: ['pdf'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'markdown-to-pdf',
    section: 'convert-to',
    name: 'Markdown to PDF',
    description: 'Turn Markdown into a typeset PDF with headings, lists, tables and code blocks.',
    icon: 'FileCode',
    input_types: ['text'],
    output_types: ['pdf'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'ipynb-to-pdf',
    section: 'convert-to',
    name: 'Jupyter Notebook to PDF',
    description:
      'Typeset a .ipynb notebook into a PDF, markdown cells, code cells, stdout, errors, tables and plot images included.',
    icon: 'Code2',
    input_types: ['document'],
    output_types: ['pdf'],
    multiple_files: true,
    worker_required: true,
    status: 'available',
    seo: { title: 'Jupyter Notebook to PDF' },
  },
  {
    slug: 'text-to-pdf',
    section: 'convert-to',
    name: 'Text to PDF',
    description: 'Lay plain text out into a PDF with a font size, margins and page numbering.',
    icon: 'Type',
    input_types: ['text'],
    output_types: ['pdf'],
    status: 'available',
  },

  // 4. Convert from PDF
  {
    slug: 'pdf-to-jpg',
    section: 'convert-from',
    name: 'PDF to Images',
    description: 'Render each page as a JPG, PNG or WebP image at the resolution you pick.',
    icon: 'ImageDown',
    input_types: ['pdf'],
    output_types: ['image', 'archive'],
    worker_required: true,
    status: 'available',
    seo: { title: 'PDF to JPG' },
  },
  {
    slug: 'pdf-to-word',
    section: 'convert-from',
    name: 'PDF to Word',
    description: 'Rebuild a PDF as an editable DOCX with its headings, paragraphs and lists.',
    icon: 'FileType',
    accent: 'text',
    popular: true,
    popular_rank: 4,
    input_types: ['pdf'],
    output_types: ['document'],
    status: 'available',
  },
  {
    slug: 'pdf-to-powerpoint',
    section: 'convert-from',
    name: 'PDF to PowerPoint',
    description: 'Turn each PDF page into a picture slide in a PPTX deck.',
    icon: 'Presentation',
    input_types: ['pdf'],
    output_types: ['document'],
    status: 'available',
  },
  {
    slug: 'pdf-to-excel',
    section: 'convert-from',
    name: 'PDF to Excel',
    description: 'Turn the text in a PDF into rows and columns in an XLSX workbook.',
    icon: 'Table',
    input_types: ['pdf'],
    output_types: ['document'],
    status: 'available',
  },
  {
    slug: 'pdf-to-pdfa',
    section: 'convert-from',
    name: 'PDF to PDF/A',
    description:
      'Rebuild a PDF with an embedded colour profile and PDF/A-2B metadata for long-term archiving.',
    icon: 'FileCheck',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'pdf-to-markdown',
    section: 'convert-from',
    name: 'PDF to Markdown',
    description:
      'Extract a PDF as Markdown, guessing headings and lists from font size and bullets.',
    icon: 'FileCode',
    input_types: ['pdf'],
    output_types: ['text'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'pdf-to-html',
    section: 'convert-from',
    name: 'PDF to HTML',
    description: 'Convert a PDF into an HTML page you can open in any browser.',
    icon: 'Code',
    input_types: ['pdf'],
    output_types: ['text'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'pdf-to-text',
    section: 'convert-from',
    name: 'PDF to Text',
    description: 'Pull the plain text out of a PDF, in reading order, with no formatting.',
    icon: 'Type',
    input_types: ['pdf'],
    output_types: ['text'],
    worker_required: true,
    status: 'available',
  },

  // 5. Edit
  {
    slug: 'rotate-pdf',
    section: 'edit',
    name: 'Rotate PDF',
    description: 'Turn pages 90, 180 or 270 degrees and fix documents that were scanned sideways.',
    icon: 'RotateCw',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'add-page-numbers',
    section: 'edit',
    name: 'Add Page Numbers',
    description: 'Stamp page numbers onto a PDF with a position, format and starting number.',
    icon: 'Hash',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'add-watermark',
    section: 'edit',
    name: 'Add Watermark',
    description: 'Lay text or an image over every page, with control over opacity and rotation.',
    icon: 'Stamp',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'crop-pdf',
    section: 'edit',
    name: 'Crop PDF',
    description: 'Trim the same margins off every page, or a page range you choose.',
    icon: 'Crop',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'edit-pdf',
    section: 'edit',
    name: 'Edit PDF',
    description: 'Drop new text boxes and images anywhere on a page and save them into the PDF.',
    icon: 'SquarePen',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'pdf-forms',
    section: 'edit',
    name: 'PDF Forms',
    description:
      'Fill in an interactive PDF form field by field, then keep it editable or flatten it.',
    icon: 'TextCursorInput',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },

  // 6. Security
  {
    slug: 'unlock-pdf',
    section: 'security',
    name: 'Unlock PDF',
    description: 'Remove a password you already know from a PDF you own.',
    icon: 'LockOpen',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'protect-pdf',
    section: 'security',
    name: 'Protect PDF',
    description: 'Add a password so the PDF cannot be opened without it.',
    icon: 'Lock',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'sign-pdf',
    section: 'security',
    name: 'Sign PDF',
    description: 'Draw, type or upload a signature and place it anywhere on the document.',
    icon: 'Signature',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'redact-pdf',
    section: 'security',
    name: 'Redact PDF',
    description: 'Black out sensitive content and remove the text underneath, not just cover it.',
    icon: 'EyeOff',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
  {
    slug: 'compare-pdf',
    section: 'security',
    name: 'Compare PDF',
    description: 'Put two versions side by side and highlight what changed between them.',
    icon: 'GitCompare',
    input_types: ['pdf'],
    output_types: ['pdf'],
    multiple_files: true,
    status: 'available',
  },
  {
    slug: 'remove-metadata',
    section: 'security',
    name: 'Remove Metadata',
    description: 'Strip the author, software and timestamps a PDF carries before you share it.',
    icon: 'Tags',
    input_types: ['pdf'],
    output_types: ['pdf'],
    status: 'available',
  },
]);

/**
 * A one-way conversion page. Each pairing is its own route and canonical URL because that is
 * how people search for it, but none of them carry their own processing: every one runs the
 * shared Convert Image implementation with the output format preset.
 *
 * Implementation: features/image/convert_image (processor.ts, workspace.tsx, presets.tsx).
 */
function conversion(from: string, to: string, description: string): ToolDraft {
  return {
    slug: `${from.toLowerCase()}-to-${to.toLowerCase()}`,
    section: 'convert',
    status: 'available',
    name: `${from} to ${to}`,
    description,
    icon: 'ArrowRightLeft',
    input_types: ['image'],
    output_types: ['image'],
    multiple_files: true,
    seo: {
      title: `${from} to ${to} Converter — Convert ${from} to ${to} Online`,
      description,
    },
  };
}

const IMAGE_TOOLS = define('image', [
  // 1. Optimize
  {
    slug: 'compress-image',
    status: 'available',
    section: 'optimize',
    name: 'Compress Image',
    description:
      'Shrink JPG, PNG, WebP, AVIF, GIF and BMP files by quality or to a target size, with the before and after side by side.',
    icon: 'Minimize2',
    input_types: ['image'],
    output_types: ['image'],
    multiple_files: true,
    seo: {
      title: 'Compress Image Online — JPG, PNG, WebP Compressor',
      description:
        'Compress images in your browser. Pick a quality level or a target file size, keep the original dimensions, and compare the result before you download.',
    },
  },
  {
    slug: 'resize-image',
    status: 'available',
    section: 'optimize',
    name: 'Resize Image',
    description:
      'Change image dimensions by exact pixels or by percentage, with the aspect ratio locked and a whole batch resized at once.',
    icon: 'Scaling',
    popular: true,
    popular_rank: 3,
    input_types: ['image'],
    output_types: ['image'],
    multiple_files: true,
    seo: {
      title: 'Resize Image Online — Resize JPG, PNG & WebP',
      description:
        'Resize images in your browser by exact pixels or by percentage. Lock the aspect ratio and resize a whole batch at once, each with its own before and after preview.',
    },
  },
  {
    slug: 'crop-image',
    status: 'available',
    section: 'optimize',
    name: 'Crop Image',
    description:
      'Crop to a freeform selection, exact dimensions, a fixed ratio such as 1:1, 4:5 or 16:9, or a circle.',
    icon: 'Crop',
    input_types: ['image'],
    output_types: ['image'],
    seo: {
      title: 'Crop Image Online — JPG, PNG & WebP Image Cropper',
      description:
        'Crop an image in your browser. Drag a freeform selection, type exact dimensions, snap to a ratio such as 1:1, 4:3, 16:9 or 9:16, or cut a circle out of the middle.',
    },
  },
  {
    slug: 'rotate-flip-image',
    status: 'available',
    section: 'optimize',
    name: 'Rotate & Flip Image',
    description:
      'Turn an image by 90, 180 or 270 degrees or any angle you type, and mirror it horizontally or vertically.',
    icon: 'RotateCw',
    input_types: ['image'],
    output_types: ['image'],
    multiple_files: true,
    seo: {
      title: 'Rotate & Flip Image Online — JPG, PNG & WebP',
      description:
        'Rotate and flip images in your browser. Turn by 90, 180 or 270 degrees or a custom angle, mirror horizontally or vertically, and apply it to a whole batch at once.',
    },
  },

  // 2. Convert
  {
    slug: 'convert-image',
    status: 'available',
    section: 'convert',
    name: 'Convert Image',
    description:
      'Convert between JPG, PNG, WebP, AVIF, GIF, BMP, TIFF, HEIC, SVG and ICO, reading and writing every one of those formats with the output quality under your control.',
    icon: 'Repeat',
    input_types: ['image'],
    output_types: ['image'],
    multiple_files: true,
    seo: {
      title: 'Convert Image Online — JPG, PNG, WebP & AVIF Converter',
      description:
        'Convert images in your browser. Drop in JPG, PNG, WebP, AVIF, GIF, BMP, TIFF, HEIC, SVG or ICO, save out to any of those same formats, and download one file or the whole batch.',
    },
  },
  conversion(
    'JPG',
    'PNG',
    'Convert JPG photos to lossless PNG files that keep every pixel intact.',
  ),
  conversion(
    'PNG',
    'JPG',
    'Convert PNG images to smaller JPG files and choose what colour fills any transparent areas.',
  ),
  conversion(
    'JPG',
    'WebP',
    'Convert JPG photos to WebP, which usually lands a good deal smaller at the same quality.',
  ),
  conversion('WebP', 'JPG', 'Convert WebP images to JPG so older software can open them.'),
  conversion('PNG', 'WebP', 'Convert PNG images to WebP and keep the transparency.'),
  conversion('WebP', 'PNG', 'Convert WebP images back to lossless PNG with transparency intact.'),
  conversion('JPG', 'AVIF', 'Convert JPG photos to AVIF, the smallest of the modern web formats.'),
  conversion('PNG', 'AVIF', 'Convert PNG images to AVIF and keep the transparency.'),
  conversion('WebP', 'AVIF', 'Convert WebP images to AVIF for a smaller file at similar quality.'),
  conversion('AVIF', 'JPG', 'Convert AVIF images to JPG so anything can open them.'),
  conversion('AVIF', 'PNG', 'Convert AVIF images to lossless PNG with transparency intact.'),
  conversion(
    'SVG',
    'PNG',
    'Turn a vector SVG into a PNG bitmap at whatever size you need, with transparency kept.',
  ),
  conversion(
    'HEIC',
    'JPG',
    'Convert the HEIC photos an iPhone takes into JPG files that open anywhere.',
  ),
  conversion('HEIC', 'PNG', 'Convert HEIC photos from an iPhone into lossless PNG files.'),
  conversion('TIFF', 'JPG', 'Convert scanned or print ready TIFF images into compact JPG files.'),

  // JPG →
  conversion(
    'JPG',
    'GIF',
    'Convert a JPG photo to GIF for simple graphics or a page that only accepts that older, widely supported format.',
  ),
  conversion(
    'JPG',
    'BMP',
    'Convert JPG photos to uncompressed BMP files for pixel perfect input into older Windows programs or print workflows.',
  ),
  conversion(
    'JPG',
    'TIFF',
    'Convert JPG photos to TIFF for archival storage or print production that expects a lossless, high fidelity file.',
  ),
  conversion(
    'JPG',
    'ICO',
    'Turn a JPG photo into an ICO file sized for a Windows desktop shortcut or application icon.',
  ),

  // PNG →
  conversion(
    'PNG',
    'GIF',
    'Convert a PNG graphic to GIF when a site or app only takes that legacy format for simple icons and flat artwork.',
  ),
  conversion(
    'PNG',
    'BMP',
    'Convert PNG images to uncompressed BMP for pixel perfect results in older software or Windows print tools.',
  ),
  conversion(
    'PNG',
    'TIFF',
    'Convert PNG images to TIFF for archival scans, layered print work or software that expects that format.',
  ),
  conversion(
    'PNG',
    'ICO',
    'Turn a PNG logo into an ICO file with the sizes a Windows app icon or desktop shortcut needs.',
  ),

  // WebP →
  conversion(
    'WebP',
    'GIF',
    'Convert WebP images to GIF for the rare app or forum upload box that still only accepts that older format.',
  ),
  conversion(
    'WebP',
    'BMP',
    'Convert WebP images to uncompressed BMP for older Windows software that cannot read modern web formats.',
  ),
  conversion(
    'WebP',
    'TIFF',
    'Convert WebP images to TIFF when a print or archival workflow needs a lossless file instead of a compressed web one.',
  ),

  // AVIF →
  conversion(
    'AVIF',
    'WebP',
    'Convert AVIF images to WebP for an app or browser that supports one modern format but not the other yet.',
  ),
  conversion(
    'AVIF',
    'GIF',
    'Convert AVIF images to GIF for the odd tool that only accepts that older, simpler format.',
  ),
  conversion(
    'AVIF',
    'BMP',
    'Convert AVIF images to uncompressed BMP for legacy software that has never heard of a modern format.',
  ),
  conversion(
    'AVIF',
    'TIFF',
    'Convert AVIF images to TIFF for print or archival pipelines that expect an uncompressed, lossless file.',
  ),

  // HEIC →
  conversion(
    'HEIC',
    'WebP',
    'Convert the HEIC photos an iPhone takes into WebP files that stay small and load fast on the web.',
  ),
  conversion(
    'HEIC',
    'AVIF',
    'Convert HEIC photos from an iPhone into AVIF, keeping the small file size in a format more apps support.',
  ),

  // TIFF →
  conversion(
    'TIFF',
    'PNG',
    'Convert a scanned or print ready TIFF into lossless PNG for easy sharing and viewing on the web.',
  ),
  conversion(
    'TIFF',
    'WebP',
    'Convert TIFF scans and print files to WebP for a much smaller file that still looks sharp online.',
  ),
  conversion(
    'TIFF',
    'AVIF',
    'Convert TIFF images to AVIF for the smallest possible file out of a large archival or scanned source.',
  ),

  // BMP →
  conversion(
    'BMP',
    'JPG',
    'Convert an uncompressed BMP into a compact JPG that is easier to share and store.',
  ),
  conversion(
    'BMP',
    'PNG',
    'Convert BMP images to lossless PNG, a format far more software and websites actually accept.',
  ),
  conversion(
    'BMP',
    'WebP',
    'Convert BMP images to WebP for a dramatically smaller file at a quality that still looks right.',
  ),
  conversion(
    'BMP',
    'AVIF',
    'Convert BMP images to AVIF for the smallest file size out of an old, uncompressed source.',
  ),

  // GIF →
  conversion('GIF', 'JPG', 'Convert a GIF frame or simple graphic into a compact JPG photo file.'),
  conversion(
    'GIF',
    'PNG',
    'Convert GIF graphics to lossless PNG and keep sharp edges and any transparency intact.',
  ),
  conversion(
    'GIF',
    'WebP',
    'Convert GIF graphics to WebP for a smaller file that still supports transparency.',
  ),
  conversion(
    'GIF',
    'AVIF',
    'Convert GIF graphics to AVIF for the smallest file size a static image from that format can reach.',
  ),

  // SVG →
  conversion(
    'SVG',
    'JPG',
    'Turn a vector SVG into a JPG bitmap at whatever size you need for places that cannot render vectors.',
  ),
  conversion(
    'SVG',
    'WebP',
    'Turn a vector SVG into a WebP bitmap, small and sharp enough for most web use.',
  ),
  conversion(
    'SVG',
    'AVIF',
    'Turn a vector SVG into an AVIF bitmap for the smallest possible rasterised file.',
  ),

  // ICO →
  conversion(
    'ICO',
    'PNG',
    'Pull the largest image embedded in an ICO icon file out into a plain PNG you can actually edit.',
  ),
  conversion(
    'ICO',
    'JPG',
    "Pull an ICO icon's largest embedded image out into a compact JPG file.",
  ),
  conversion(
    'ICO',
    'WebP',
    "Pull an ICO icon's largest embedded image out into a small WebP file.",
  ),
  conversion(
    'ICO',
    'AVIF',
    "Pull an ICO icon's largest embedded image out into the smallest possible AVIF file.",
  ),

  // 3. Edit and create
  {
    slug: 'image-editor',
    status: 'available',
    section: 'edit',
    name: 'Image Editor',
    description:
      'Add text, shapes, drawings and overlays, then tune brightness, contrast, saturation, blur, borders and background on a canvas.',
    icon: 'Palette',
    input_types: ['image'],
    output_types: ['image'],
    seo: {
      title: 'Image Editor Online — Edit Photos Free',
      description:
        'Edit an image in your browser. Draw on it, add text, shapes and overlays, adjust brightness, contrast, saturation and blur, then add a border or background and save.',
    },
  },
  {
    slug: 'watermark-image',
    status: 'available',
    section: 'edit',
    name: 'Watermark Image',
    description:
      'Lay text or a logo over an image with control over position, opacity, rotation, scale and tiling.',
    icon: 'Stamp',
    input_types: ['image'],
    output_types: ['image'],
    multiple_files: true,
    seo: {
      title: 'Add Watermark to Image Online — Text & Logo Watermark',
      description:
        'Add a text or logo watermark to an image in your browser. Set the position, opacity, rotation and size, or repeat it across the whole picture.',
    },
  },
  {
    slug: 'meme-generator',
    status: 'available',
    section: 'edit',
    name: 'Meme Generator',
    description:
      'Put top and bottom captions on a picture, or drop extra text boxes wherever you want them.',
    icon: 'MessageSquareText',
    input_types: ['image'],
    output_types: ['image'],
    seo: {
      title: 'Meme Generator — Create Memes Online Free',
      description:
        'Make a meme in your browser. Upload a picture, add top and bottom captions or as many text boxes as you like, set the font size, and download the result.',
    },
  },
  {
    slug: 'collage-maker',
    status: 'available',
    section: 'edit',
    name: 'Collage Maker',
    description:
      'Arrange several photos into a grid, then set the spacing, border, background and overall shape.',
    icon: 'LayoutGrid',
    input_types: ['image'],
    output_types: ['image'],
    multiple_files: true,
    seo: {
      title: 'Photo Collage Maker — Create Collages Online',
      description:
        'Build a photo collage in your browser. Pick a grid layout, adjust the spacing, borders, background colour and aspect ratio, and export the finished picture.',
    },
  },
  {
    slug: 'screenshot-beautifier',
    status: 'available',
    section: 'edit',
    name: 'Screenshot Beautifier',
    description:
      'Drop a screenshot onto a background with padding, rounded corners, a shadow and a simple window frame.',
    icon: 'Frame',
    input_types: ['image'],
    output_types: ['image'],
    seo: {
      title: 'Screenshot Beautifier — Create Beautiful Screenshots',
      description:
        'Make a screenshot presentable in your browser. Add a background, padding, rounded corners, a shadow and a window frame, then export it ready to share.',
    },
  },

  // 4. Privacy and analysis
  {
    slug: 'blur-pixelate',
    status: 'available',
    section: 'privacy',
    name: 'Blur & Pixelate Image',
    description:
      'Draw boxes over faces, names or anything private and blur or pixelate each one, or soften the whole picture at once.',
    icon: 'EyeOff',
    input_types: ['image'],
    output_types: ['image'],
    seo: {
      title: 'Blur Image Online — Blur Faces, Text & Private Information',
      description:
        'Blur or pixelate part of an image in your browser. Draw a box over each face, name or number you want hidden, choose how strong to make it, and save the result.',
    },
  },
  {
    slug: 'image-metadata',
    status: 'available',
    section: 'privacy',
    name: 'Image Metadata',
    description:
      'See the EXIF, camera, date, GPS and colour information inside a photo, then save a copy with all of it stripped.',
    icon: 'Info',
    input_types: ['image'],
    output_types: ['image', 'text'],
    seo: {
      title: 'Image Metadata Viewer & Remover — View or Remove EXIF',
      description:
        'Read the EXIF data hidden in a photo, including camera, date, GPS location, orientation, dimensions and colour profile, then download a clean copy with it removed.',
    },
  },

  // 5. Extract
  {
    slug: 'image-to-text',
    status: 'available',
    section: 'extract',
    name: 'Image to Text',
    description:
      'Read the text out of a picture or a scan with OCR that runs on your own machine, then copy it or save it as a file.',
    icon: 'ScanText',
    input_types: ['image'],
    output_types: ['text'],
    worker_required: true,
    seo: {
      title: 'Image to Text OCR — Extract Text from Images Online',
      description:
        'Pull the text out of a JPG, PNG, WebP or TIFF with OCR that runs entirely in your browser. Copy what it finds or download it as a text or markdown file.',
    },
  },
  {
    slug: 'color-extractor',
    status: 'available',
    section: 'extract',
    name: 'Color Extractor',
    description:
      'Pull the dominant colours out of a picture as a palette, or click anywhere to read one pixel.',
    icon: 'Pipette',
    input_types: ['image'],
    output_types: ['text'],
    seo: {
      title: 'Color Palette Extractor — Extract Colors from Image',
      description:
        'Extract a colour palette from an image in your browser. See the dominant colours as HEX, RGB and HSL, click any pixel to sample it, and copy the value.',
    },
  },

  // Images to PDF and PDF to images live under /pdf only. A second copy here would compete
  // with them in search and split the traffic for the same job; the Image Tools page links
  // across to them instead. See CATEGORY_CROSS_LINKS in lib/tools/sections.ts.
]);

/**
 * Eight tools, one per job a visitor actually searches for. Each tool owns every feature
 * listed for it in docs/video_tools.md; those features are not separate registry entries or
 * sections, they are options inside the one workspace. See docs/video_tools.md before adding
 * or renaming anything here.
 */
const VIDEO_TOOLS = define('video', [
  {
    slug: 'compress-video',
    name: 'Compress Video',
    description:
      'Shrink a video by quality, target file size or bitrate, with a before and after preview.',
    icon: 'Minimize2',
    popular: true,
    input_types: ['video'],
    output_types: ['video'],
    worker_required: true,
    status: 'available',
    section: 'edit-optimize',
  },
  {
    slug: 'resize-crop-video',
    name: 'Resize & Crop Video',
    description:
      'Scale to a resolution or a social media preset, or crop to a new aspect ratio.',
    icon: 'Scaling',
    input_types: ['video'],
    output_types: ['video'],
    worker_required: true,
    status: 'available',
    section: 'edit-optimize',
  },
  {
    slug: 'trim-cut-video',
    name: 'Trim & Cut Video',
    description:
      'Cut to a start and end point, remove or keep several segments, split into parts, and preview the result before exporting.',
    icon: 'Scissors',
    popular: true,
    input_types: ['video'],
    output_types: ['video'],
    worker_required: true,
    status: 'available',
    section: 'edit-optimize',
  },
  {
    slug: 'convert-video',
    name: 'Convert Video',
    description:
      'Convert between MP4, WebM, MOV, AVI, MKV and other common formats, or pull out just the audio as MP3, WAV or another audio format.',
    icon: 'Repeat',
    popular: true,
    input_types: ['video'],
    output_types: ['video', 'audio'],
    worker_required: true,
    status: 'available',
    section: 'convert-create',
  },
  {
    slug: 'gif-maker',
    name: 'GIF Maker',
    description:
      'Turn a video into a GIF. Convert the whole clip, or drag the trim handles to pick exactly the part you want, then set the frame rate and size.',
    icon: 'Clapperboard',
    popular: true,
    input_types: ['video'],
    output_types: ['image'],
    worker_required: true,
    status: 'available',
    section: 'convert-create',
  },
  {
    slug: 'screen-recorder',
    name: 'Screen & Camera Recorder',
    description:
      'Record your screen, camera or both with a presentation preset and a draggable webcam bubble. Test every device first, then trim and pick a format before you download.',
    icon: 'Video',
    popular: true,
    input_types: ['none'],
    output_types: ['video'],
    worker_required: true,
    status: 'available',
    section: 'record',
  },
  {
    slug: 'video-editor',
    name: 'Video Editor',
    description:
      'Merge clips, add music, text, images and filters, then adjust speed, volume and rotation before exporting.',
    icon: 'Clapperboard',
    input_types: ['video'],
    output_types: ['video'],
    multiple_files: true,
    worker_required: true,
    section: 'advanced-editing',
  },
  {
    slug: 'video-subtitles',
    name: 'Subtitles & Captions',
    description:
      'Add subtitles from an SRT or VTT file, generate them automatically, style and time them, then burn them into the video.',
    icon: 'Captions',
    input_types: ['video'],
    output_types: ['video', 'text'],
    worker_required: true,
    section: 'advanced-editing',
  },
]);

const AUDIO_TOOLS = define('audio', [
  {
    slug: 'convert-audio',
    name: 'Audio Converter',
    description: 'Convert audio between MP3, WAV, M4A/AAC, OGG/Vorbis and FLAC.',
    icon: 'Repeat',
    section: 'convert-compress',
    popular: true,
    input_types: ['audio'],
    output_types: ['audio'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'compress-audio',
    name: 'Audio Compressor',
    description:
      'Reduce file size with bitrate, quality, sample rate and target size controls.',
    icon: 'Minimize2',
    section: 'convert-compress',
    input_types: ['audio'],
    output_types: ['audio'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'video-to-audio',
    name: 'Video to Audio',
    description:
      'Extract audio from MP4, MOV, WebM, MKV, AVI and FLV as MP3, WAV, M4A/AAC, OGG, FLAC or AIFF.',
    icon: 'FileOutput',
    section: 'convert-compress',
    input_types: ['video'],
    output_types: ['audio'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'trim-audio',
    name: 'Audio Trimmer & Cutter',
    description:
      'Trim, cut multiple sections, delete parts, split, reorder and fade in or out on a waveform.',
    icon: 'Scissors',
    section: 'edit-combine',
    input_types: ['audio'],
    output_types: ['audio'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'merge-audio',
    name: 'Audio Merger & Joiner',
    description:
      'Merge multiple files, reorder clips, add gaps or crossfades, and set per clip volume.',
    icon: 'Combine',
    section: 'edit-combine',
    input_types: ['audio'],
    output_types: ['audio'],
    worker_required: true,
    multiple_files: true,
    status: 'available',
  },
  {
    slug: 'volume-booster',
    name: 'Volume Booster & Normalizer',
    description: 'Raise or lower volume, adjust gain and normalize an audio file.',
    icon: 'Volume2',
    section: 'edit-combine',
    input_types: ['audio'],
    output_types: ['audio'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'audio-speed-pitch',
    name: 'Audio Speed & Pitch Changer',
    description:
      'Change speed and tempo, shift pitch, or slow down and speed up without changing pitch.',
    icon: 'Scaling',
    section: 'edit-combine',
    input_types: ['audio'],
    output_types: ['audio'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'reverse-audio',
    name: 'Reverse Audio',
    description: 'Reverse an entire audio file and preview it before downloading.',
    icon: 'ArrowRightLeft',
    section: 'edit-combine',
    input_types: ['audio'],
    output_types: ['audio'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'voice-recorder',
    name: 'Voice Recorder',
    description:
      'Record from your microphone, pause and resume, then play back and download.',
    icon: 'Mic',
    section: 'record-manage',
    input_types: ['none'],
    output_types: ['audio'],
    worker_required: true,
    status: 'available',
  },
  {
    slug: 'audio-metadata-editor',
    name: 'Audio Metadata Editor',
    description:
      'Edit MP3 tags: title, artist, album, genre, year, track number and artwork.',
    icon: 'Tags',
    section: 'record-manage',
    input_types: ['audio'],
    output_types: ['audio'],
    worker_required: true,
    status: 'available',
  },
]);

const TEXT_TOOLS = define('text', [
  // 1. Count & Analyze
  {
    slug: 'word-counter',
    section: 'count-analyze',
    name: 'Word & Character Counter',
    description:
      'Count words, characters, sentences, paragraphs and lines, plus reading and speaking time.',
    icon: 'Type',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'text-analyzer',
    section: 'count-analyze',
    name: 'Text Statistics',
    description:
      'Break down word frequency, unique and repeated words, average word length and keyword density.',
    icon: 'BarChart3',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },

  // 2. Convert & Transform
  {
    slug: 'case-converter',
    section: 'convert-transform',
    name: 'Case Converter',
    description:
      'Switch text between sentence case, title case, UPPERCASE, lowercase, camelCase, snake_case, kebab case and CONSTANT_CASE.',
    icon: 'CaseSensitive',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'slug-generator',
    section: 'convert-transform',
    name: 'Slug Generator',
    description: 'Turn a title into a clean, lowercase URL slug.',
    icon: 'Link',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'text-reverser',
    section: 'convert-transform',
    name: 'Text Reverser',
    description: 'Reverse whole text, individual words, letters or the order of lines.',
    icon: 'FlipHorizontal',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'text-sorter',
    section: 'convert-transform',
    name: 'Sort & Shuffle Text',
    description:
      'Sort lines alphabetically, numerically or naturally, shuffle them randomly, or drop duplicate lines.',
    icon: 'ArrowDownUp',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },

  // 3. Find & Clean
  {
    slug: 'find-replace',
    section: 'find-clean',
    name: 'Find & Replace',
    description:
      'Find and replace text with case sensitive, whole word and regular expression matching.',
    icon: 'Replace',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'text-cleaner',
    section: 'find-clean',
    name: 'Text Cleaner',
    description:
      'Strip extra spaces, blank lines, invisible characters, emojis, accents, smart quotes and HTML tags from pasted text.',
    icon: 'Eraser',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'line-editor',
    section: 'find-clean',
    name: 'Line Editor',
    description: 'Add a prefix, suffix or line numbers, and keep or remove lines that match a search.',
    icon: 'Rows3',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },

  // 4. Split & Combine
  {
    slug: 'text-splitter',
    section: 'split-combine',
    name: 'Text Splitter & Joiner',
    description:
      'Split text by newline, comma, space or a custom delimiter, or join a list back into one line.',
    icon: 'SplitSquareHorizontal',
    input_types: ['text'],
    output_types: ['text', 'archive'],
    status: 'available',
  },
  {
    slug: 'duplicate-lines',
    section: 'split-combine',
    name: 'Find Duplicates',
    description: 'Highlight, count and remove duplicate lines while keeping the first or last occurrence.',
    icon: 'Copy',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },

  // 5. Compare & Format
  {
    slug: 'text-diff',
    section: 'compare-format',
    name: 'Text Diff Checker',
    description: 'Compare two blocks of text and highlight what was added, removed and changed.',
    icon: 'GitCompare',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'markdown-formatter',
    section: 'compare-format',
    name: 'Markdown Formatter & Preview',
    description: 'Tidy Markdown formatting and preview the rendered result side by side.',
    icon: 'FileCode',
    status: 'available',
    input_types: ['text'],
    output_types: ['text'],
  },
]);

const DEVELOPER_TOOLS = define('developer', [
  // 1. Code Formatting & Highlighting
  {
    slug: 'code-formatter',
    section: 'code',
    name: 'Code Formatter & Beautifier',
    description:
      'Format and beautify code in dozens of languages, from JavaScript and Python to JSON and SQL, with syntax highlighting.',
    icon: 'Code2',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'code-minifier',
    section: 'code',
    name: 'Code Minifier',
    description: 'Minify HTML, CSS, JavaScript and JSON to shrink file size before shipping.',
    icon: 'Minimize2',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'code-diff',
    section: 'code',
    name: 'Code Diff Checker',
    description:
      'Compare two versions of code or text side by side with an option to ignore whitespace.',
    icon: 'FileDiff',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },

  // 2. JSON & Data Tools
  {
    slug: 'json-formatter',
    section: 'data',
    name: 'JSON Formatter & Validator',
    description:
      'Pretty print, minify and validate JSON with a collapsible tree view and the exact line of any error.',
    icon: 'Braces',
    input_types: ['json', 'text'],
    output_types: ['json'],
    status: 'available',
  },
  {
    slug: 'json-yaml-xml-converter',
    section: 'data',
    name: 'JSON, YAML & XML Converter',
    description: 'Convert between JSON, YAML and XML in either direction.',
    icon: 'Repeat',
    input_types: ['json', 'text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'csv-viewer',
    section: 'data',
    name: 'CSV Viewer & Converter',
    description: 'View a CSV file as a sortable table and convert it to and from JSON.',
    icon: 'Table',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'base64-converter',
    section: 'data',
    name: 'Base64 Encoder & Decoder',
    description: 'Encode text or a file to Base64, or decode Base64 back to text or the original file.',
    icon: 'Binary',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },

  // 3. Web & Markup Tools
  {
    slug: 'html-tools',
    section: 'web-url',
    name: 'HTML Tools',
    description: 'Encode, decode, escape, strip and preview HTML in one place.',
    icon: 'Code',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'url-encoder-decoder',
    section: 'web-url',
    name: 'URL Encoder & Decoder',
    description: 'Percent encode text for a URL or query string, or decode it back to readable text.',
    icon: 'Link2',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'url-parser',
    section: 'web-url',
    name: 'URL Parser',
    description: 'Break a URL down into its protocol, host, path, query parameters and hash.',
    icon: 'ListTree',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },

  // 4. Encoding & Security Utilities
  {
    slug: 'hash-generator',
    section: 'encoding-utilities',
    name: 'Hash Generator',
    description: 'Generate MD5, SHA1, SHA256, SHA384 and SHA512 hashes from text or a file.',
    icon: 'Shield',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'jwt-decoder',
    section: 'encoding-utilities',
    name: 'JWT Decoder',
    description:
      'Inspect the header, payload and expiry of a JSON Web Token, decoded entirely in the browser.',
    icon: 'KeyRound',
    input_types: ['text'],
    output_types: ['json'],
    status: 'available',
  },
  {
    slug: 'uuid-generator',
    section: 'encoding-utilities',
    name: 'UUID Generator',
    description: 'Generate version 4 UUIDs in bulk with uppercase, lowercase and hyphen options.',
    icon: 'Fingerprint',
    input_types: ['none'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'url-query-string',
    section: 'encoding-utilities',
    name: 'URL Query String Tool',
    description:
      'Convert a query string to JSON and back, then add or edit parameters with automatic URL encoding.',
    icon: 'ListFilter',
    input_types: ['text'],
    output_types: ['text'],
    status: 'available',
  },

  // 5. API & Network
  {
    slug: 'http-status-codes',
    section: 'api-reference',
    name: 'HTTP Status Code Lookup',
    description: 'Look up any HTTP status code to see its meaning, category and common use.',
    icon: 'Server',
    input_types: ['none'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'mime-type-lookup',
    section: 'api-reference',
    name: 'MIME Type Lookup',
    description: 'Look up a MIME type by file extension or a file extension by MIME type.',
    icon: 'FileSearch',
    input_types: ['none'],
    output_types: ['text'],
    status: 'available',
  },

  // 6. Developer Generators
  {
    slug: 'random-data-generator',
    section: 'generate',
    name: 'Random Data Generator',
    description:
      'Generate realistic test data such as names, emails, numbers, dates and UUIDs, exported as JSON or CSV.',
    icon: 'Dices',
    input_types: ['none'],
    output_types: ['text'],
    status: 'available',
  },
  {
    slug: 'lorem-ipsum',
    section: 'generate',
    name: 'Lorem Ipsum Generator',
    description: 'Generate placeholder paragraphs, sentences or words for a mockup, with optional HTML output.',
    icon: 'AlignLeft',
    input_types: ['none'],
    output_types: ['text'],
    status: 'available',
  },
]);

const CONVERTER_TOOLS = define('converters', [
  {
    slug: 'unit-converter',
    name: 'Unit Converter',
    description: 'Convert between metric and imperial units across length, area, volume and speed.',
    icon: 'ArrowLeftRight',
    input_types: ['none'],
    output_types: ['text'],
  },
  {
    slug: 'time-converter',
    name: 'Time Converter',
    description: 'Convert a time between time zones and between seconds, minutes, hours and days.',
    icon: 'Clock',
    input_types: ['none'],
    output_types: ['text'],
  },
  {
    slug: 'currency-converter',
    name: 'Currency Converter',
    description: 'Convert between currencies using recent exchange rates.',
    icon: 'Banknote',
    input_types: ['none'],
    output_types: ['text'],
    // Exchange rates cannot be computed offline; this tool will fetch published rates.
    client_only: false,
  },
  {
    slug: 'temperature-converter',
    name: 'Temperature Converter',
    description: 'Convert between Celsius, Fahrenheit and Kelvin.',
    icon: 'Thermometer',
    input_types: ['none'],
    output_types: ['text'],
  },
  {
    slug: 'length-converter',
    name: 'Length Converter',
    description:
      'Convert between millimetres, centimetres, metres, kilometres, inches, feet and miles.',
    icon: 'Ruler',
    input_types: ['none'],
    output_types: ['text'],
  },
  {
    slug: 'weight-converter',
    name: 'Weight Converter',
    description: 'Convert between grams, kilograms, tonnes, ounces, pounds and stones.',
    icon: 'Weight',
    input_types: ['none'],
    output_types: ['text'],
  },
  {
    slug: 'data-converter',
    name: 'Data Converter',
    description: 'Convert between bytes, kilobytes, megabytes, gigabytes and terabytes.',
    icon: 'HardDrive',
    input_types: ['none'],
    output_types: ['text'],
  },
]);

const UTILITY_TOOLS = define('utilities', [
  {
    slug: 'qr-generator',
    name: 'QR Generator',
    description:
      'Create a styled QR code for a link, contact card, Wi-Fi network and more, then download it as PNG or SVG.',
    icon: 'QrCode',
    input_types: ['text'],
    output_types: ['image'],
    status: 'available',
  },
  {
    slug: 'password-generator',
    name: 'Password Generator',
    description: 'Generate strong passwords locally with control over length and character sets.',
    icon: 'KeyRound',
    input_types: ['none'],
    output_types: ['text'],
  },
  {
    slug: 'random-generator',
    name: 'Random Generator',
    description: 'Draw random numbers, pick from a list or shuffle items.',
    icon: 'Dices',
    input_types: ['none'],
    output_types: ['text'],
  },
  {
    slug: 'calculator',
    name: 'Calculator',
    description: 'A keyboard-friendly calculator with a running history of your entries.',
    icon: 'Calculator',
    input_types: ['none'],
    output_types: ['text'],
  },
  {
    slug: 'stopwatch',
    name: 'Stopwatch',
    description: 'Time something with lap splits, accurate even in a background tab.',
    icon: 'Timer',
    input_types: ['none'],
    output_types: ['none'],
    status: 'available',
  },
  {
    slug: 'timer',
    name: 'Timer',
    description: 'Set a countdown with a sound and a notification when it finishes.',
    icon: 'AlarmClock',
    input_types: ['none'],
    output_types: ['none'],
    status: 'available',
  },
]);

const AI_TOOLS = define('ai', [
  {
    slug: 'gemini-watermark-remover',
    name: 'Gemini Watermark Remover',
    description: 'Remove the Gemini sparkle watermark from an image automatically.',
    icon: 'Sparkles',
    input_types: ['image'],
    output_types: ['image'],
    status: 'available',
    seo: {
      title: 'Gemini Watermark Remover — Remove the Gemini Sparkle Mark',
      description:
        'Remove the Gemini sparkle watermark from an image in your browser. Detection is automatic and removal is an exact reverse of the blend Gemini used to add the mark, not a blur.',
    },
  },
  {
    slug: 'gemini-video-watermark-remover',
    name: 'Gemini Video Watermark Remover',
    description: 'Remove the Gemini sparkle watermark from every frame of a video automatically.',
    icon: 'Sparkles',
    input_types: ['video'],
    output_types: ['video'],
    status: 'available',
    seo: {
      title: 'Gemini Video Watermark Remover — Remove the Gemini Sparkle Mark',
      description:
        'Remove the Gemini sparkle watermark from a video in your browser. Every frame is detected and restored automatically, with audio kept unchanged.',
    },
  },
]);

export const TOOLS: readonly Tool[] = [
  ...PDF_TOOLS,
  ...IMAGE_TOOLS,
  ...VIDEO_TOOLS,
  ...AUDIO_TOOLS,
  ...TEXT_TOOLS,
  ...DEVELOPER_TOOLS,
  ...CONVERTER_TOOLS,
  ...UTILITY_TOOLS,
  ...AI_TOOLS,
];

const TOOL_BY_PATH = new Map(TOOLS.map((tool) => [`${tool.category}/${tool.slug}`, tool]));
const TOOL_BY_SLUG = new Map(TOOLS.map((tool) => [tool.slug, tool]));

/**
 * URLs are flat (`/{slug}`), so every tool slug shares one namespace with every other tool
 * slug and every category slug. The category folder no longer partitions that namespace for
 * free, so it's enforced here at module load instead of hoped for.
 */
if (TOOL_BY_SLUG.size !== TOOLS.length) {
  const seen = new Set<string>();
  const duplicates = TOOLS.map((tool) => tool.slug).filter((slug) =>
    seen.has(slug) ? true : (seen.add(slug), false),
  );
  throw new Error(`Duplicate tool slug(s) across categories: ${[...new Set(duplicates)].join(', ')}`);
}
for (const tool of TOOLS) {
  if ((TOOL_CATEGORIES as readonly { slug: string }[]).some((category) => category.slug === tool.slug)) {
    throw new Error(
      `Tool slug "${tool.slug}" collides with a category slug. Flat URLs require every tool ` +
        'slug to be globally unique and distinct from every category slug.',
    );
  }
}

const TOOLS_BY_CATEGORY = new Map<ToolCategoryId, Tool[]>(
  TOOL_CATEGORIES.map((category) => [
    category.id,
    TOOLS.filter((tool) => tool.category === category.id),
  ]),
);

export function getTool(category: string, slug: string): Tool | undefined {
  return TOOL_BY_PATH.get(`${category}/${slug}`);
}

/** Flat lookup for the `/{slug}` route — a tool's category comes from the tool it finds. */
export function getToolBySlug(slug: string): Tool | undefined {
  return TOOL_BY_SLUG.get(slug);
}

export function getToolsByCategory(category: ToolCategoryId): readonly Tool[] {
  return TOOLS_BY_CATEGORY.get(category) ?? [];
}

export function getPopularTools(limit = 6): readonly Tool[] {
  return TOOLS.filter((tool) => tool.popular)
    .sort(
      (a, b) =>
        (a.popular_rank ?? Number.MAX_SAFE_INTEGER) - (b.popular_rank ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, limit);
}

export function getAvailableTools(): readonly Tool[] {
  return TOOLS.filter((tool) => tool.status === 'available');
}

export function toolPath(tool: Tool): string {
  return `/${tool.slug}`;
}

/** Tools shown alongside a tool page: same category first, then other categories sharing an input type. */
export function getRelatedTools(tool: Tool, limit = 6): readonly Tool[] {
  const sameCategory = getToolsByCategory(tool.category).filter((item) => item.slug !== tool.slug);
  if (sameCategory.length >= limit) return sameCategory.slice(0, limit);

  const sharesInput = TOOLS.filter(
    (item) =>
      item.category !== tool.category &&
      item.input_types.some((type) => tool.input_types.includes(type)),
  );
  return [...sameCategory, ...sharesInput].slice(0, limit);
}

export function searchTools(query: string, limit = 12): readonly Tool[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];

  const scored = TOOLS.map((tool) => {
    const name = tool.name.toLowerCase();
    let score = 0;
    if (name === needle) score = 100;
    else if (name.startsWith(needle)) score = 80;
    else if (name.includes(needle)) score = 60;
    else if (tool.slug.includes(needle.replace(/\s+/g, '-'))) score = 50;
    else if (tool.description.toLowerCase().includes(needle)) score = 20;
    if (score > 0 && tool.popular) score += 5;
    return { tool, score };
  }).filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
  return scored.slice(0, limit).map((entry) => entry.tool);
}
