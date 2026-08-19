'use client';

import { Code } from 'lucide-react';
import { TextExtractWorkspace } from '@/components/pdf/text_extract_workspace';

export function PdfToHtmlWorkspace() {
  return (
    <TextExtractWorkspace
      processorId="pdf.pdf-to-html"
      actionIcon={Code}
      actionLabel="Convert to HTML"
      actioningLabel="Converting"
      hint="Headings and lists are guessed from font size and bullet markers. Check the result before relying on it."
      monospacePreview={false}
    />
  );
}
