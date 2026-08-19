'use client';

import { FileCode } from 'lucide-react';
import { TextToPdfWorkspace } from '@/components/pdf/text_to_pdf_workspace';

export function MarkdownToPdfWorkspace() {
  return (
    <TextToPdfWorkspace
      processorId="pdf.markdown-to-pdf"
      actionIcon={FileCode}
      actionLabel="Convert to PDF"
      actioningLabel="Typesetting"
      hint="Headings, lists, fenced code blocks and pipe tables are typeset, with **bold**, *italic* and `code` resolved inline. Nested styling and links are not."
      placeholder={'# Heading\n\nSome text with a list:\n\n* First item\n* Second item\n'}
      fileRule={{ mime_types: ['text/markdown', 'text/plain'], extensions: ['md', 'markdown'], max_bytes: 10 * 1024 * 1024 }}
      fileAccept="text/markdown,.md,.markdown"
    />
  );
}
