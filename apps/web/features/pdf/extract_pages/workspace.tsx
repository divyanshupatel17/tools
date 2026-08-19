'use client';

import { FileOutput } from 'lucide-react';
import { PageSelectWorkspace } from '@/components/pdf/page_select_workspace';

export function ExtractPagesWorkspace() {
  return (
    <PageSelectWorkspace
      processorId="pdf.extract-pages"
      mode="extract"
      actionIcon={FileOutput}
      actionLabel="Extract selected pages"
      actioningLabel="Extracting"
      hint="Tap a page to select it. Only the selected pages are saved into the new document."
      emptySelectionError="Select at least one page to extract."
    />
  );
}
