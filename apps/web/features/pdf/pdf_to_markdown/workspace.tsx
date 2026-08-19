'use client';

import { FileCode } from 'lucide-react';
import { TextExtractWorkspace } from '@/components/pdf/text_extract_workspace';

export function PdfToMarkdownWorkspace() {
  return (
    <TextExtractWorkspace
      processorId="pdf.pdf-to-markdown"
      actionIcon={FileCode}
      actionLabel="Convert to Markdown"
      actioningLabel="Converting"
      hint="Headings and lists are guessed from font size and bullet markers. Check the result before relying on it."
    />
  );
}
