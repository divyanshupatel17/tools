import type { Metadata } from 'next';
import { ToolsBrowser, type ToolGroup } from '@/components/landing/tools_browser';
import { buildMetadata } from '@/lib/seo/metadata';
import { TOOL_CATEGORIES } from '@/lib/tools/categories';
import { getToolsByCategory } from '@/lib/tools/registry';

export const metadata: Metadata = buildMetadata({
  title: 'All Tools',
  description:
    'Every tool on divyanshupatel.com/tools, grouped by category. PDF, image, video, audio, text, developer, converter and utility tools that run in your browser.',
  path: '/all',
  keywords: ['all online tools', 'free browser tools', 'pdf tools', 'image tools'],
});

export default function AllToolsPage() {
  const groups: ToolGroup[] = TOOL_CATEGORIES.map((category) => ({
    category,
    tools: getToolsByCategory(category.id),
  }));

  return (
    <ToolsBrowser
      title="All Tools."
      description="Everything in one place, grouped by what it does. Every tool runs in your browser, so your files are never uploaded."
      groups={groups}
    />
  );
}
