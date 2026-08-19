'use client';

import type { ReactNode } from 'react';
import { TextFooterCount, TextToolbar } from '@/components/text/text_toolbar';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';

export interface TextInputPanelProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  minHeightClassName?: string;
  /** Persists the draft to localStorage under this key, restored on the next visit. Omit to
   * disable autosave for a tool that should not remember what was typed. */
  autosaveKey?: string;
  /** Label above the editable pane in the fullscreen editor. Defaults to "Input Text". */
  inputLabel?: string;
  /** The tool's own result view, shown beside the input in the fullscreen editor — see
   * `TextToolbar`. Omit only for a tool with no derived result to show. */
  expandedOutput?: ReactNode;
  /** Label above `expandedOutput` in the fullscreen editor. Defaults to "Result". */
  expandedOutputLabel?: string;
}

/** The left hand paste box every single textarea Text tool starts from: the shared toolbar
 * (upload, open, paste, clear, autosave, expand), the textarea itself, and a word/character
 * count footer. Options and results live in the tool's own control panel to the right. Every
 * import — plain text, code, PDF or Word — lands here as extracted text; the original file is
 * never shown. A tool with more than one textarea (Case Converter's input/converted panels)
 * composes `TextToolbar` and `TextFooterCount` directly instead of this wrapper. */
export function TextInputPanel({
  value,
  onChange,
  placeholder,
  disabled,
  minHeightClassName = 'min-h-[55vh]',
  autosaveKey,
  inputLabel = 'Input Text',
  expandedOutput,
  expandedOutputLabel,
}: TextInputPanelProps) {
  return (
    <div>
      <TextToolbar
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        autosaveKey={autosaveKey}
        inputLabel={inputLabel}
        expandedOutput={expandedOutput}
        expandedOutputLabel={expandedOutputLabel}
      />
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn('font-mono', minHeightClassName)}
      />
      <TextFooterCount value={value} />
    </div>
  );
}
