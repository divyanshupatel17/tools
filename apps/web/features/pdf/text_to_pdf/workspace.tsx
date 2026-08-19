'use client';

import { useState } from 'react';
import { Type } from 'lucide-react';
import { TextToPdfWorkspace } from '@/components/pdf/text_to_pdf_workspace';

export function TextToPdfFeatureWorkspace() {
  const [pageNumbers, setPageNumbers] = useState(false);

  return (
    <TextToPdfWorkspace
      processorId="pdf.text-to-pdf"
      actionIcon={Type}
      actionLabel="Convert to PDF"
      actioningLabel="Typesetting"
      hint="Each line becomes a line in the PDF. It only wraps when it's too wide for the page, so manual line breaks are kept."
      placeholder="Paste or type your text here…"
      fileRule={{ mime_types: ['text/plain'], extensions: ['txt'], max_bytes: 10 * 1024 * 1024 }}
      fileAccept="text/plain,.txt"
      extraOptions={({ disabled }) => (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pageNumbers}
            onChange={(event) => setPageNumbers(event.target.checked)}
            disabled={disabled}
            className="accent-brand size-4"
          />
          <span className="font-semibold">Add page numbers</span>
        </label>
      )}
      buildExtraOptions={() => ({ page_numbers: pageNumbers })}
    />
  );
}
