import type { ToolProcessor } from '@tools/tool_engine';
import { generateSlug, type SlugOptions } from '@/lib/text/slug_generator';

const slugGenerator: ToolProcessor<SlugOptions> = async ({ text, options }, { on_progress }) => {
  on_progress?.({ ratio: 0, label: 'Generating' });
  const slug = generateSlug(text ?? '', options);
  on_progress?.({ ratio: 1, label: 'Done' });

  return {
    artifacts: [
      {
        file_name: 'slug.txt',
        mime_type: 'text/plain',
        blob: new Blob([slug], { type: 'text/plain' }),
      },
    ],
    text: slug,
  };
};

export default slugGenerator;
