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
    popular_rank: 4,
    input_types: ['pdf'],
    output_types: ['pdf'],
    multiple_files: true,
    worker_required: true,
    status: 'available',
    seo: {
      title: 'Merge PDF — Combine PDF Files Online',
      description: 'Combine several PDF files into one document and reorder them before saving.',
      keywords: ['merge pdf', 'combine pdf files', 'join pdf online', 'merge pdf free'],
    },
  },
  {
    slug: 'split-pdf',
    section: 'organize',
    name: 'Split PDF',
    description:
      'Break a PDF into separate documents by page range or split every page into its own file.',
    icon: 'Scissors',
    input_types: ['pdf'],
    output_types: ['pdf', 'archive'],
    worker_required: true,
    status: 'available',
    seo: {
      title: 'Split PDF — Break a PDF into Separate Files',
      description:
        'Break a PDF into separate documents by page range or split every page into its own file.',
      keywords: ['split pdf', 'split pdf by page', 'extract pdf pages', 'divide pdf online'],
    },
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
    seo: {
      title: 'Remove Pages from a PDF',
      description: 'Delete the pages you do not want and download the shortened document.',
      keywords: ['remove pdf pages', 'delete pages from pdf', 'delete pdf page online'],
    },
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
    seo: {
      title: 'Extract Pages from a PDF',
      description:
        'Pull selected pages out of a PDF into a new document, leaving the original alone.',
      keywords: ['extract pdf pages', 'pull pages from pdf', 'save pdf pages as new file'],
    },
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
    seo: {
      title: 'Organize PDF — Reorder and Rotate Pages',
      description: 'Reorder, rotate and delete pages on one screen, then export the rebuilt PDF.',
      keywords: ['organize pdf pages', 'reorder pdf pages', 'rotate pdf pages online'],
    },
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
    seo: {
      title: 'Scan to PDF — Turn Photos into a PDF',
      description: 'Photograph pages with your camera and save them straight into a single PDF.',
      keywords: ['scan to pdf', 'photo to pdf', 'camera scan pdf online'],
    },
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
    popular_rank: 3,
    input_types: ['pdf'],
    output_types: ['pdf'],
    worker_required: true,
    status: 'available',
    seo: {
      title: 'Compress PDF to a Target Size — 100KB, 200KB, 500KB, 1MB',
      description:
        'Compress a PDF in your browser to a target size such as 100KB, 200KB, 500KB or 1MB, or by quality level. Text stays selectable and nothing is uploaded.',
      keywords: [
        'compress pdf to 100kb',
        'compress pdf to 200kb',
        'compress pdf to 500kb',
        'compress pdf to 1mb',
        'reduce pdf file size',
        'shrink pdf online',
        'pdf compressor',
        'make pdf smaller',
      ],
    },
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
    seo: {
      title: 'Repair a Damaged or Corrupt PDF',
      description: 'Rebuild a damaged PDF so it opens again, recovering whatever is still readable.',
      keywords: ['repair pdf', 'fix corrupt pdf', 'pdf wont open fix', 'recover pdf file'],
    },
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
    seo: {
      title: 'OCR PDF — Make a Scanned PDF Searchable',
      description:
        'Recognise the text in a scanned PDF so it can be searched, selected and copied.',
      keywords: ['ocr pdf', 'make scanned pdf searchable', 'pdf text recognition online'],
    },
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
    seo: {
      title: 'Flatten PDF Forms and Annotations',
      description:
        'Bake form fields, annotations and layers into the page so they can no longer be edited.',
      keywords: ['flatten pdf', 'flatten pdf form', 'lock pdf form fields'],
    },
  },

  // 3. Convert to PDF. Slugs keep the format people search for; names say what the tool covers.
  {
    slug: 'jpg-to-pdf',
    section: 'convert-to',
    name: 'Images to PDF',
    description: 'Turn JPG, PNG, WebP, GIF and BMP files into one PDF, with page size and margins.',
    icon: 'ImagePlus',
    accent: 'audio',
    input_types: ['image'],
    output_types: ['pdf'],
    multiple_files: true,
    status: 'available',
    seo: {
      title: 'JPG to PDF',
      keywords: ['jpg to pdf', 'image to pdf', 'convert images to pdf', 'png to pdf'],
    },
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
    seo: {
      title: 'Word to PDF Converter',
      description: 'Lay a DOCX document out as a PDF, text, headings, lists and tables included.',
      keywords: ['word to pdf', 'docx to pdf', 'convert word document to pdf'],
    },
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
    seo: {
      title: 'PowerPoint to PDF Converter',
      description: 'Lay the text from each slide out on its own PDF page, in slide order.',
      keywords: ['powerpoint to pdf', 'pptx to pdf', 'convert ppt to pdf'],
    },
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
    seo: {
      title: 'Excel to PDF Converter',
      description:
        'Lay the first sheet of an XLSX workbook out as a table across as many pages as it needs.',
      keywords: ['excel to pdf', 'xlsx to pdf', 'convert spreadsheet to pdf'],
    },
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
    seo: {
      title: 'HTML to PDF Converter',
      description: 'Render pasted HTML into a paginated PDF with your choice of page size.',
      keywords: ['html to pdf', 'convert html to pdf online', 'webpage to pdf'],
    },
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
    seo: {
      title: 'Markdown to PDF Converter',
      description: 'Turn Markdown into a typeset PDF with headings, lists, tables and code blocks.',
      keywords: ['markdown to pdf', 'md to pdf', 'convert markdown to pdf online'],
    },
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
    seo: {
      title: 'Jupyter Notebook to PDF',
      keywords: ['ipynb to pdf', 'jupyter notebook to pdf', 'convert notebook to pdf'],
    },
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
    seo: {
      title: 'Text to PDF Converter',
      description: 'Lay plain text out into a PDF with a font size, margins and page numbering.',
      keywords: ['text to pdf', 'txt to pdf', 'convert text file to pdf'],
    },
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
    seo: {
      title: 'PDF to JPG',
      keywords: ['pdf to jpg', 'pdf to image', 'pdf to png', 'convert pdf to images'],
    },
  },
  {
    slug: 'pdf-to-word',
    section: 'convert-from',
    name: 'PDF to Word',
    description: 'Rebuild a PDF as an editable DOCX with its headings, paragraphs and lists.',
    icon: 'FileType',
    accent: 'text',
    input_types: ['pdf'],
    output_types: ['document'],
    status: 'available',
    seo: {
      title: 'PDF to Word Converter',
      description: 'Rebuild a PDF as an editable DOCX with its headings, paragraphs and lists.',
      keywords: ['pdf to word', 'pdf to docx', 'convert pdf to editable word document'],
    },
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
    seo: {
      title: 'PDF to PowerPoint Converter',
      description: 'Turn each PDF page into a picture slide in a PPTX deck.',
      keywords: ['pdf to powerpoint', 'pdf to pptx', 'convert pdf to slides'],
    },
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
    seo: {
      title: 'PDF to Excel Converter',
      description: 'Turn the text in a PDF into rows and columns in an XLSX workbook.',
      keywords: ['pdf to excel', 'pdf to xlsx', 'convert pdf table to spreadsheet'],
    },
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
    seo: {
      title: 'PDF to PDF/A Converter',
      description:
        'Rebuild a PDF with an embedded colour profile and PDF/A-2B metadata for long-term archiving.',
      keywords: ['pdf to pdfa', 'pdf archival format', 'pdf/a converter online'],
    },
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
    seo: {
      title: 'PDF to Markdown Converter',
      description:
        'Extract a PDF as Markdown, guessing headings and lists from font size and bullets.',
      keywords: ['pdf to markdown', 'pdf to md', 'convert pdf to markdown online'],
    },
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
    seo: {
      title: 'PDF to HTML Converter',
      description: 'Convert a PDF into an HTML page you can open in any browser.',
      keywords: ['pdf to html', 'convert pdf to webpage'],
    },
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
    seo: {
      title: 'PDF to Text Converter',
      description: 'Pull the plain text out of a PDF, in reading order, with no formatting.',
      keywords: ['pdf to text', 'pdf to txt', 'extract text from pdf'],
    },
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
    seo: {
      title: 'Rotate PDF Pages',
      description: 'Turn pages 90, 180 or 270 degrees and fix documents that were scanned sideways.',
      keywords: ['rotate pdf', 'rotate pdf pages online', 'fix sideways pdf'],
    },
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
    seo: {
      title: 'Add Page Numbers to a PDF',
      description: 'Stamp page numbers onto a PDF with a position, format and starting number.',
      keywords: ['add page numbers to pdf', 'number pdf pages online'],
    },
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
    seo: {
      title: 'Add a Watermark to a PDF',
      description: 'Lay text or an image over every page, with control over opacity and rotation.',
      keywords: ['add watermark to pdf', 'watermark pdf online', 'stamp pdf pages'],
    },
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
    seo: {
      title: 'Crop PDF Pages',
      description: 'Trim the same margins off every page, or a page range you choose.',
      keywords: ['crop pdf', 'trim pdf margins', 'crop pdf pages online'],
    },
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
    seo: {
      title: 'Edit PDF Online',
      description: 'Drop new text boxes and images anywhere on a page and save them into the PDF.',
      keywords: ['edit pdf', 'edit pdf online free', 'add text to pdf'],
    },
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
    seo: {
      title: 'Fill In a PDF Form',
      description:
        'Fill in an interactive PDF form field by field, then keep it editable or flatten it.',
      keywords: ['fill pdf form', 'pdf form filler online'],
    },
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
    seo: {
      title: 'Unlock PDF — Remove a PDF Password',
      description: 'Remove a password you already know from a PDF you own.',
      keywords: ['unlock pdf', 'remove pdf password', 'pdf password remover'],
    },
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
    seo: {
      title: 'Protect PDF with a Password',
      description: 'Add a password so the PDF cannot be opened without it.',
      keywords: ['protect pdf', 'password protect pdf online', 'add password to pdf'],
    },
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
    seo: {
      title: 'Sign a PDF Online',
      description: 'Draw, type or upload a signature and place it anywhere on the document.',
      keywords: ['sign pdf', 'esign pdf online', 'add signature to pdf'],
    },
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
    seo: {
      title: 'Redact a PDF',
      description: 'Black out sensitive content and remove the text underneath, not just cover it.',
      keywords: ['redact pdf', 'black out pdf text', 'pdf redaction online'],
    },
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
    seo: {
      title: 'Compare Two PDFs',
      description: 'Put two versions side by side and highlight what changed between them.',
      keywords: ['compare pdf', 'pdf diff online', 'compare two pdf files'],
    },
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
    seo: {
      title: 'Remove PDF Metadata',
      description: 'Strip the author, software and timestamps a PDF carries before you share it.',
      keywords: ['remove pdf metadata', 'strip pdf metadata online'],
    },
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
      keywords: [
        `${from} to ${to}`,
        `${from.toLowerCase()} to ${to.toLowerCase()} converter`,
        `convert ${from} to ${to}`,
        `${from} to ${to} online`,
        `${from} to ${to} free`,
      ],
    },
  };
}

const IMAGE_TOOLS = define('image', [
  // 1. Optimize
  {
    slug: 'compress-image',
    status: 'available',
    section: 'optimize',
    name: 'Image Compressor',
    description:
      'Shrink JPG, PNG, WebP, AVIF, GIF and BMP files by quality or to a target size, with the before and after side by side.',
    icon: 'Minimize2',
    popular: true,
    popular_rank: 2,
    input_types: ['image'],
    output_types: ['image'],
    multiple_files: true,
    seo: {
      title: 'Compress Image to 10KB, 20KB, 50KB, 100KB or 200KB',
      description:
        'Compress a JPG, PNG or WebP to a target size such as 10KB, 20KB, 50KB, 100KB or 200KB, or by quality. Compare before and after, nothing is uploaded.',
      keywords: [
        'compress image to 10kb',
        'compress image to 20kb',
        'compress image to 50kb',
        'compress image to 100kb',
        'compress image to 200kb',
        'reduce image size online',
        'jpg compressor',
        'png compressor',
        'image compressor',
      ],
    },
  },
  {
    slug: 'resize-image',
    status: 'available',
    section: 'optimize',
    name: 'Image Resizer',
    description:
      'Change image dimensions by exact pixels or by percentage, with the aspect ratio locked and a whole batch resized at once.',
    icon: 'Scaling',
    popular: true,
    popular_rank: 6,
    input_types: ['image'],
    output_types: ['image'],
    multiple_files: true,
    seo: {
      title: 'Resize Image Online — Resize JPG, PNG & WebP',
      description:
        'Resize images in your browser by exact pixels or by percentage. Lock the aspect ratio and resize a whole batch at once, each with its own before and after preview.',
      keywords: ['resize image', 'resize image online', 'change image dimensions', 'image resizer'],
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
      keywords: ['crop image', 'crop image online', 'crop photo to circle', 'image cropper'],
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
      keywords: ['rotate image', 'flip image online', 'mirror image'],
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
        'Convert between JPG, PNG, WebP, AVIF, GIF, BMP, TIFF, HEIC, SVG and ICO in your browser, and download one file or the whole batch.',
      keywords: ['convert image', 'image format converter', 'image converter online'],
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
      keywords: ['image editor', 'edit photo online free', 'online photo editor'],
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
      keywords: ['watermark image', 'add watermark to photo', 'logo watermark online'],
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
      keywords: ['meme generator', 'make a meme online free', 'meme maker'],
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
      keywords: ['collage maker', 'photo collage online', 'picture grid maker'],
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
      keywords: ['screenshot beautifier', 'beautify screenshot online', 'screenshot background'],
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
      keywords: ['blur image', 'blur face in photo online', 'pixelate image'],
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
      keywords: ['image metadata viewer', 'remove exif data', 'view photo exif online'],
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
      keywords: ['image to text', 'ocr image online', 'extract text from picture'],
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
      keywords: ['color palette extractor', 'extract colors from image', 'color picker from photo'],
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
    seo: {
      title: 'Compress Video to 10MB, 25MB, 50MB or 100MB',
      description:
        'Compress an MP4 or MOV in your browser to a target size such as 10MB, 25MB, 50MB or 100MB, or by quality and bitrate. Preview before and after, nothing is uploaded.',
      keywords: [
        'compress video to 10mb',
        'compress video to 25mb',
        'compress video to 50mb',
        'compress video to 100mb',
        'reduce video file size',
        'video compressor',
        'shrink video online',
      ],
    },
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
    seo: {
      title: 'Resize & Crop Video Online',
      description: 'Scale to a resolution or a social media preset, or crop to a new aspect ratio.',
      keywords: ['resize video', 'crop video online', 'video aspect ratio converter'],
    },
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
    seo: {
      title: 'Trim & Cut Video Online',
      description:
        'Cut to a start and end point, remove or keep several segments, split into parts, and preview the result before exporting.',
      keywords: ['trim video', 'cut video online', 'video cutter free'],
    },
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
    seo: {
      title: 'Convert Video Online — MP4, WebM, MOV & More',
      description:
        'Convert between MP4, WebM, MOV, AVI, MKV and other common formats, or pull out just the audio as MP3, WAV or another audio format.',
      keywords: ['convert video', 'video converter online', 'mp4 to webm', 'video to mp3'],
    },
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
    seo: {
      title: 'Video to GIF Maker',
      description:
        'Turn a video into a GIF. Convert the whole clip, or drag the trim handles to pick exactly the part you want, then set the frame rate and size.',
      keywords: ['video to gif', 'mp4 to gif', 'gif maker online'],
    },
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
    seo: {
      title: 'Screen & Camera Recorder Online',
      description:
        'Record your screen, camera or both with a presentation preset and a draggable webcam bubble. Test devices first, then trim and pick a format.',
      keywords: ['screen recorder online', 'record screen and webcam', 'free screen recorder'],
    },
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
    seo: {
      title: 'Audio Converter — MP3, WAV, AAC, OGG, FLAC',
      description: 'Convert audio between MP3, WAV, M4A/AAC, OGG/Vorbis and FLAC.',
      keywords: ['audio converter', 'mp3 to wav', 'convert audio online free'],
    },
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
    seo: {
      title: 'Compress Audio to 1MB, 5MB, 10MB or a Target Size',
      description:
        'Compress an MP3 or WAV in your browser to a target size such as 1MB, 5MB or 10MB, or by bitrate and sample rate. Nothing is uploaded.',
      keywords: [
        'compress audio to 1mb',
        'compress mp3 to 5mb',
        'reduce audio file size',
        'mp3 compressor',
        'audio compressor',
      ],
    },
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
    seo: {
      title: 'Video to Audio Converter — Extract MP3 from Video',
      description:
        'Extract audio from MP4, MOV, WebM, MKV, AVI and FLV as MP3, WAV, M4A/AAC, OGG, FLAC or AIFF.',
      keywords: ['video to audio', 'extract audio from video', 'mp4 to mp3'],
    },
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
    seo: {
      title: 'Audio Trimmer & Cutter Online',
      description:
        'Trim, cut multiple sections, delete parts, split, reorder and fade in or out on a waveform.',
      keywords: ['trim audio', 'cut mp3 online', 'audio cutter free'],
    },
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
    seo: {
      title: 'Audio Merger & Joiner Online',
      description:
        'Merge multiple files, reorder clips, add gaps or crossfades, and set per clip volume.',
      keywords: ['merge audio files', 'join mp3 online', 'combine audio tracks'],
    },
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
    seo: {
      title: 'Volume Booster & Audio Normalizer',
      description: 'Raise or lower volume, adjust gain and normalize an audio file.',
      keywords: ['increase mp3 volume online', 'audio normalizer', 'boost audio volume'],
    },
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
    seo: {
      title: 'Audio Speed & Pitch Changer',
      description:
        'Change speed and tempo, shift pitch, or slow down and speed up without changing pitch.',
      keywords: ['change audio speed', 'audio pitch changer', 'slow down audio online'],
    },
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
    seo: {
      title: 'Reverse an Audio File Online',
      description: 'Reverse an entire audio file and preview it before downloading.',
      keywords: ['reverse audio', 'reverse mp3 online'],
    },
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
    seo: {
      title: 'Online Voice Recorder',
      description: 'Record from your microphone, pause and resume, then play back and download.',
      keywords: ['voice recorder online', 'record audio in browser', 'free online voice recorder'],
    },
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
    seo: {
      title: 'Audio Metadata / MP3 Tag Editor',
      description: 'Edit MP3 tags: title, artist, album, genre, year, track number and artwork.',
      keywords: ['edit mp3 tags', 'mp3 metadata editor online', 'id3 tag editor'],
    },
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
    seo: {
      title: 'Word & Character Counter',
      description:
        'Count words, characters, sentences, paragraphs and lines, plus reading and speaking time.',
      keywords: ['word counter', 'character counter online', 'count words in text'],
    },
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
    seo: {
      title: 'Text Statistics & Word Frequency Analyzer',
      description:
        'Break down word frequency, unique and repeated words, average word length and keyword density.',
      keywords: ['text analyzer', 'word frequency counter', 'keyword density checker'],
    },
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
    seo: {
      title: 'Case Converter — Upper, Lower, Title, camelCase',
      description:
        'Switch text between sentence case, title case, UPPERCASE, lowercase, camelCase, snake_case, kebab case and CONSTANT_CASE.',
      keywords: ['case converter', 'text to uppercase', 'camelcase converter'],
    },
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
    seo: {
      title: 'URL Slug Generator',
      description: 'Turn a title into a clean, lowercase URL slug.',
      keywords: ['slug generator', 'url slug generator online', 'text to slug'],
    },
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
    seo: {
      title: 'Text Reverser Online',
      description: 'Reverse whole text, individual words, letters or the order of lines.',
      keywords: ['reverse text', 'text reverser online', 'reverse words'],
    },
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
    seo: {
      title: 'Sort & Shuffle Lines of Text',
      description:
        'Sort lines alphabetically, numerically or naturally, shuffle them randomly, or drop duplicate lines.',
      keywords: ['sort lines alphabetically', 'shuffle text lines', 'text sorter online'],
    },
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
    seo: {
      title: 'Find & Replace Text Online',
      description:
        'Find and replace text with case sensitive, whole word and regular expression matching.',
      keywords: ['find and replace text online', 'regex find and replace'],
    },
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
    seo: {
      title: 'Text Cleaner — Remove Extra Spaces & Formatting',
      description:
        'Strip extra spaces, blank lines, invisible characters, emojis, accents, smart quotes and HTML tags from pasted text.',
      keywords: ['remove extra spaces from text', 'text cleaner online', 'strip html tags from text'],
    },
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
    seo: {
      title: 'Line Editor — Add Prefixes, Suffixes & Line Numbers',
      description:
        'Add a prefix, suffix or line numbers, and keep or remove lines that match a search.',
      keywords: ['add line numbers to text', 'add prefix to each line', 'line editor online'],
    },
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
    seo: {
      title: 'Text Splitter & Joiner Online',
      description:
        'Split text by newline, comma, space or a custom delimiter, or join a list back into one line.',
      keywords: ['text splitter online', 'split text by delimiter', 'join lines of text'],
    },
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
    seo: {
      title: 'Find & Remove Duplicate Lines',
      description:
        'Highlight, count and remove duplicate lines while keeping the first or last occurrence.',
      keywords: ['remove duplicate lines', 'find duplicate lines online'],
    },
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
    seo: {
      title: 'Text Diff Checker Online',
      description: 'Compare two blocks of text and highlight what was added, removed and changed.',
      keywords: ['text diff checker', 'compare two texts online', 'diff checker'],
    },
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
    seo: {
      title: 'Markdown Formatter & Live Preview',
      description: 'Tidy Markdown formatting and preview the rendered result side by side.',
      keywords: ['markdown formatter', 'markdown preview online', 'markdown editor'],
    },
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
    seo: {
      title: 'Code Formatter & Beautifier Online',
      description:
        'Format and beautify code in dozens of languages, from JavaScript and Python to JSON and SQL, with syntax highlighting.',
      keywords: ['code formatter', 'beautify code online', 'json formatter'],
    },
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
    seo: {
      title: 'Code Minifier — HTML, CSS, JS, JSON',
      description: 'Minify HTML, CSS, JavaScript and JSON to shrink file size before shipping.',
      keywords: ['code minifier', 'minify javascript online', 'minify css online'],
    },
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
    seo: {
      title: 'Code Diff Checker Online',
      description:
        'Compare two versions of code or text side by side with an option to ignore whitespace.',
      keywords: ['code diff checker', 'compare code online'],
    },
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
    seo: {
      title: 'JSON Formatter & Validator',
      description:
        'Pretty print, minify and validate JSON with a collapsible tree view and the exact line of any error.',
      keywords: ['json formatter', 'json validator online', 'pretty print json'],
    },
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
    seo: {
      title: 'JSON, YAML & XML Converter',
      description: 'Convert between JSON, YAML and XML in either direction.',
      keywords: ['json to yaml', 'yaml to json', 'json to xml converter'],
    },
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
    seo: {
      title: 'CSV Viewer & Converter',
      description: 'View a CSV file as a sortable table and convert it to and from JSON.',
      keywords: ['csv viewer online', 'csv to json', 'view csv file online'],
    },
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
    seo: {
      title: 'Base64 Encoder & Decoder',
      description:
        'Encode text or a file to Base64, or decode Base64 back to text or the original file.',
      keywords: ['base64 encode', 'base64 decode online', 'base64 converter'],
    },
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
    seo: {
      title: 'HTML Encoder, Decoder & Preview',
      description: 'Encode, decode, escape, strip and preview HTML in one place.',
      keywords: ['html encoder decoder', 'html escape online', 'strip html tags'],
    },
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
    seo: {
      title: 'URL Encoder & Decoder',
      description:
        'Percent encode text for a URL or query string, or decode it back to readable text.',
      keywords: ['url encoder', 'url decoder online', 'percent encode text'],
    },
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
    seo: {
      title: 'URL Parser Online',
      description: 'Break a URL down into its protocol, host, path, query parameters and hash.',
      keywords: ['url parser', 'parse url online', 'url breakdown tool'],
    },
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
    seo: {
      title: 'Hash Generator — MD5, SHA1, SHA256',
      description: 'Generate MD5, SHA1, SHA256, SHA384 and SHA512 hashes from text or a file.',
      keywords: ['md5 hash generator', 'sha256 online', 'hash generator'],
    },
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
    seo: {
      title: 'JWT Decoder Online',
      description:
        'Inspect the header, payload and expiry of a JSON Web Token, decoded entirely in the browser.',
      keywords: ['jwt decoder', 'decode jwt token online'],
    },
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
    seo: {
      title: 'UUID Generator — Bulk UUID v4',
      description: 'Generate version 4 UUIDs in bulk with uppercase, lowercase and hyphen options.',
      keywords: ['uuid generator', 'generate uuid online', 'guid generator'],
    },
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
    seo: {
      title: 'URL Query String Tool',
      description:
        'Convert a query string to JSON and back, then add or edit parameters with automatic URL encoding.',
      keywords: ['query string to json', 'url query string parser'],
    },
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
    seo: {
      title: 'HTTP Status Code Lookup',
      description: 'Look up any HTTP status code to see its meaning, category and common use.',
      keywords: ['http status codes', 'http status code list', 'what is status code 404'],
    },
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
    seo: {
      title: 'MIME Type Lookup',
      description: 'Look up a MIME type by file extension or a file extension by MIME type.',
      keywords: ['mime type lookup', 'file extension to mime type'],
    },
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
    seo: {
      title: 'Random Test Data Generator',
      description:
        'Generate realistic test data such as names, emails, numbers, dates and UUIDs, exported as JSON or CSV.',
      keywords: ['random data generator', 'fake data generator', 'mock data generator online'],
    },
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
    seo: {
      title: 'Lorem Ipsum Generator',
      description:
        'Generate placeholder paragraphs, sentences or words for a mockup, with optional HTML output.',
      keywords: ['lorem ipsum generator', 'placeholder text generator'],
    },
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
    seo: {
      title: 'Unit Converter',
      description: 'Convert between metric and imperial units across length, area, volume and speed.',
      keywords: ['unit converter', 'metric to imperial converter'],
    },
  },
  {
    slug: 'time-converter',
    name: 'Time Converter',
    description: 'Convert a time between time zones and between seconds, minutes, hours and days.',
    icon: 'Clock',
    input_types: ['none'],
    output_types: ['text'],
    seo: {
      title: 'Time Converter — Time Zones & Units',
      description: 'Convert a time between time zones and between seconds, minutes, hours and days.',
      keywords: ['time zone converter', 'time converter online'],
    },
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
    seo: {
      title: 'Currency Converter',
      description: 'Convert between currencies using recent exchange rates.',
      keywords: ['currency converter', 'exchange rate converter online'],
    },
  },
  {
    slug: 'temperature-converter',
    name: 'Temperature Converter',
    description: 'Convert between Celsius, Fahrenheit and Kelvin.',
    icon: 'Thermometer',
    input_types: ['none'],
    output_types: ['text'],
    seo: {
      title: 'Temperature Converter — Celsius, Fahrenheit, Kelvin',
      description: 'Convert between Celsius, Fahrenheit and Kelvin.',
      keywords: ['celsius to fahrenheit', 'temperature converter'],
    },
  },
  {
    slug: 'length-converter',
    name: 'Length Converter',
    description:
      'Convert between millimetres, centimetres, metres, kilometres, inches, feet and miles.',
    icon: 'Ruler',
    input_types: ['none'],
    output_types: ['text'],
    seo: {
      title: 'Length Converter',
      description:
        'Convert between millimetres, centimetres, metres, kilometres, inches, feet and miles.',
      keywords: ['length converter', 'cm to inches', 'feet to meters'],
    },
  },
  {
    slug: 'weight-converter',
    name: 'Weight Converter',
    description: 'Convert between grams, kilograms, tonnes, ounces, pounds and stones.',
    icon: 'Weight',
    input_types: ['none'],
    output_types: ['text'],
    seo: {
      title: 'Weight Converter',
      description: 'Convert between grams, kilograms, tonnes, ounces, pounds and stones.',
      keywords: ['weight converter', 'kg to lbs', 'pounds to kilograms'],
    },
  },
  {
    slug: 'data-converter',
    name: 'Data Converter',
    description: 'Convert between bytes, kilobytes, megabytes, gigabytes and terabytes.',
    icon: 'HardDrive',
    input_types: ['none'],
    output_types: ['text'],
    seo: {
      title: 'Data Size Converter',
      description: 'Convert between bytes, kilobytes, megabytes, gigabytes and terabytes.',
      keywords: ['data size converter', 'mb to gb converter', 'kb to mb'],
    },
  },
]);

const UTILITY_TOOLS = define('utilities', [
  {
    slug: 'qr-generator',
    name: 'QR Generator',
    description:
      'Create a styled QR code for a link, contact card, Wi-Fi network and more, then download it as PNG or SVG.',
    icon: 'QrCode',
    popular: true,
    popular_rank: 5,
    input_types: ['text'],
    output_types: ['image'],
    status: 'available',
    seo: {
      title: 'QR Code Generator — Free & Styled',
      description:
        'Create a styled QR code for a link, contact card, Wi-Fi network and more, then download it as PNG or SVG.',
      keywords: ['qr code generator', 'free qr code maker', 'wifi qr code generator'],
    },
  },
  {
    slug: 'random-generator',
    name: 'Random Generator',
    description: 'Draw random numbers, pick from a list or shuffle items.',
    icon: 'Dices',
    input_types: ['none'],
    output_types: ['text'],
    seo: {
      title: 'Random Number & List Generator',
      description: 'Draw random numbers, pick from a list or shuffle items.',
      keywords: ['random number generator', 'random picker online', 'shuffle list online'],
    },
  },
  {
    slug: 'stopwatch',
    name: 'Stopwatch',
    description: 'Time something with lap splits, accurate even in a background tab.',
    icon: 'Timer',
    input_types: ['none'],
    output_types: ['none'],
    status: 'available',
    seo: {
      title: 'Online Stopwatch with Lap Splits',
      description: 'Time something with lap splits, accurate even in a background tab.',
      keywords: ['online stopwatch', 'stopwatch with laps'],
    },
  },
  {
    slug: 'timer',
    name: 'Timer',
    description: 'Set a countdown with a sound and a notification when it finishes.',
    icon: 'AlarmClock',
    input_types: ['none'],
    output_types: ['none'],
    status: 'available',
    seo: {
      title: 'Online Countdown Timer',
      description: 'Set a countdown with a sound and a notification when it finishes.',
      keywords: ['online timer', 'countdown timer online'],
    },
  },
]);

const AI_TOOLS = define('ai', [
  {
    slug: 'gemini-watermark-remover',
    name: 'Gemini Watermark Remover',
    description: 'Remove the Gemini sparkle watermark from an image automatically.',
    icon: 'Sparkles',
    popular: true,
    popular_rank: 1,
    input_types: ['image'],
    output_types: ['image'],
    status: 'available',
    seo: {
      title: 'Gemini Watermark Remover — Remove the Gemini Sparkle Mark',
      description:
        'Remove the Gemini sparkle watermark from an image in your browser. Detection is automatic and removal exactly reverses the blend Gemini used, not a blur.',
      keywords: [
        'remove gemini watermark',
        'gemini sparkle watermark remover',
        'remove ai watermark from image',
      ],
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
      title: 'Gemini Video Watermark Remover',
      description:
        'Remove the Gemini sparkle watermark from a video in your browser. Every frame is detected and restored automatically, with audio kept unchanged.',
      keywords: ['remove gemini watermark from video', 'gemini video watermark remover'],
    },
  },
]);

const MATH_TOOLS = define('math', [
  {
    slug: 'calculator',
    name: 'Basic Calculator',
    description: 'A keyboard-friendly calculator with a running history of your entries.',
    icon: 'Calculator',
    input_types: ['none'],
    output_types: ['text'],
    status: 'available',
    seo: {
      title: 'Online Calculator',
      description: 'A keyboard-friendly calculator with a running history of your entries.',
      keywords: ['online calculator', 'basic calculator online'],
    },
  },
  {
    slug: 'scientific-calculator',
    name: 'Scientific Calculator',
    description:
      'Trigonometric, logarithmic, exponential and other advanced functions, with degree and radian modes.',
    icon: 'FunctionSquare',
    input_types: ['none'],
    output_types: ['text'],
    status: 'available',
    seo: {
      title: 'Scientific Calculator Online',
      description:
        'Trigonometric, logarithmic, exponential and other advanced functions, with degree and radian modes.',
      keywords: ['scientific calculator online', 'trig calculator'],
    },
  },
  {
    slug: 'graphing-calculator',
    name: 'Graphing Calculator',
    description: 'Plot one or more functions on a 2D graph, pan and zoom, and trace exact values.',
    icon: 'LineChart',
    input_types: ['none'],
    output_types: ['image'],
    status: 'available',
    seo: {
      title: 'Graphing Calculator Online',
      description: 'Plot one or more functions on a 2D graph, pan and zoom, and trace exact values.',
      keywords: ['graphing calculator online', 'plot function graph', 'function grapher'],
    },
  },
  {
    slug: 'programmer-calculator',
    name: 'Programmer Calculator',
    description: 'Convert and compute across binary, octal, decimal and hexadecimal, with bitwise operators.',
    icon: 'Binary',
    input_types: ['none'],
    output_types: ['text'],
    status: 'available',
    seo: {
      title: 'Programmer Calculator — Binary, Hex, Octal',
      description:
        'Convert and compute across binary, octal, decimal and hexadecimal, with bitwise operators.',
      keywords: ['programmer calculator', 'binary to hex converter', 'hex calculator online'],
    },
  },
  {
    slug: 'matrix-calculator',
    name: 'Matrix Calculator',
    description: 'Add, multiply, invert, transpose and find the determinant of matrices.',
    icon: 'Grid3x3',
    input_types: ['none'],
    output_types: ['text'],
    status: 'available',
    seo: {
      title: 'Matrix Calculator Online',
      description: 'Add, multiply, invert, transpose and find the determinant of matrices.',
      keywords: ['matrix calculator', 'matrix multiplication calculator', 'matrix inverse calculator'],
    },
  },
  {
    slug: '3d-graphing-calculator',
    name: '3D Graphing Calculator',
    description: 'Plot a surface from a two variable function and rotate the view in three dimensions.',
    icon: 'Box',
    input_types: ['none'],
    output_types: ['image'],
    status: 'available',
    seo: {
      title: '3D Graphing Calculator Online',
      description:
        'Plot a surface from a two variable function and rotate the view in three dimensions.',
      keywords: ['3d graphing calculator', '3d function plotter online'],
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
  ...MATH_TOOLS,
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
    const keywords = tool.seo.keywords?.map((keyword) => keyword.toLowerCase()) ?? [];
    let score = 0;
    if (name === needle) score = 100;
    else if (keywords.includes(needle)) score = 90;
    else if (name.startsWith(needle)) score = 80;
    else if (keywords.some((keyword) => keyword.includes(needle) || needle.includes(keyword)))
      score = 70;
    else if (name.includes(needle)) score = 60;
    else if (tool.slug.includes(needle.replace(/\s+/g, '-'))) score = 50;
    else if (tool.description.toLowerCase().includes(needle)) score = 20;
    if (score > 0 && tool.popular) score += 5;
    return { tool, score };
  }).filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
  return scored.slice(0, limit).map((entry) => entry.tool);
}
