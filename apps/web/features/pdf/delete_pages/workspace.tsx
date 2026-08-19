'use client';

import { FileMinus } from 'lucide-react';
import { PageSelectWorkspace } from '@/components/pdf/page_select_workspace';

export function DeletePagesWorkspace() {
  return (
    <PageSelectWorkspace
      processorId="pdf.delete-pages"
      mode="delete"
      actionIcon={FileMinus}
      actionLabel="Remove selected pages"
      actioningLabel="Removing"
      hint="Tap a page to select it for removal. Everything else stays in the document."
      emptySelectionError="Select at least one page to remove."
    />
  );
}
