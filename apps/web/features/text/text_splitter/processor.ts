import type { ToolProcessor } from '@tools/tool_engine';
import { zipFiles } from '@/lib/browser/zip';
import {
  joinItems,
  joinLines,
  splitText,
  type SplitJoinOptions,
  type TextSplitterOperation,
} from '@/lib/text/text_splitter';

export interface TextSplitterProcessorOptions extends SplitJoinOptions {
  operation?: TextSplitterOperation;
  /** The workspace's current (possibly hand reordered) item list. Falls back to deriving it
   * from `text` when omitted, so the processor still works from raw text alone. */
  items?: string[];
}

const textSplitter: ToolProcessor<TextSplitterProcessorOptions> = async (
  { text, options },
  { on_progress },
) => {
  const operation = options?.operation ?? 'split';

  if (operation === 'join') {
    on_progress?.({ ratio: 0, label: 'Joining' });
    const result = options?.items
      ? joinItems(options.items, options)
      : joinLines(text ?? '', options ?? {});
    on_progress?.({ ratio: 1, label: 'Done' });
    return {
      artifacts: [
        {
          file_name: 'joined-text.txt',
          mime_type: 'text/plain',
          blob: new Blob([result], { type: 'text/plain' }),
        },
      ],
      text: result,
    };
  }

  on_progress?.({ ratio: 0, label: 'Splitting' });
  const items = options?.items ?? splitText(text ?? '', options ?? {});
  const encoder = new TextEncoder();
  const zip = await zipFiles(
    items.map((item, index) => ({
      file_name: `${index + 1}.txt`,
      bytes: encoder.encode(item),
    })),
  );
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'split-items.zip',
        mime_type: 'application/zip',
        blob: zip,
      },
    ],
    text: items.join('\n'),
  };
};

export default textSplitter;
