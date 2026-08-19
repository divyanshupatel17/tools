'use client';

import { Code } from 'lucide-react';
import { TextToPdfWorkspace } from '@/components/pdf/text_to_pdf_workspace';

export function HtmlToPdfWorkspace() {
  return (
    <TextToPdfWorkspace
      processorId="pdf.html-to-pdf"
      actionIcon={Code}
      actionLabel="Convert to PDF"
      actioningLabel="Typesetting"
      hint="Supports headings, paragraphs, lists, tables, and inline formatting like bold, italic, and code. CSS layout and images are not reproduced."
      placeholder={'<h1>Heading</h1>\n<p>Some paragraph text.</p>\n<ul>\n  <li>First item</li>\n  <li>Second item</li>\n</ul>'}
      fileRule={{ mime_types: ['text/html'], extensions: ['html', 'htm'], max_bytes: 10 * 1024 * 1024 }}
      fileAccept="text/html,.html,.htm"
    />
  );
}
