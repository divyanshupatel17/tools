'use client';

import { Type } from 'lucide-react';
import { TextExtractWorkspace } from '@/components/pdf/text_extract_workspace';

export function PdfToTextWorkspace() {
  return (
    <TextExtractWorkspace
      processorId="pdf.pdf-to-text"
      actionIcon={Type}
      actionLabel="Extract text"
      actioningLabel="Reading"
      hint="Pulls the plain text out of every page, in reading order, with no formatting. Complex multiple column layouts may not read back in the original order."
    />
  );
}
