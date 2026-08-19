import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ToolIcon } from '@/components/ui/tool_icon';
import { accentStyle, toolAccent } from '@/lib/tools/accents';
import { toolPath } from '@/lib/tools/registry';
import type { Tool } from '@/lib/tools/tool_types';

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link
      href={toolPath(tool)}
      className="group rounded-card border-border bg-surface hover:border-brand flex flex-col gap-2 border p-4 transition-colors"
    >
      <span className="flex items-center gap-2">
        <span
          className="flex size-9 items-center justify-center rounded-lg"
          style={accentStyle(toolAccent(tool))}
        >
          <ToolIcon name={tool.icon} />
        </span>
        {tool.status === 'planned' && <Badge>Soon</Badge>}
      </span>
      <span className="font-semibold">{tool.name}</span>
      <span className="text-muted line-clamp-2 text-sm">{tool.description}</span>
    </Link>
  );
}

export function ToolCardGrid({ tools }: { tools: readonly Tool[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tools.map((tool) => (
        <li key={`${tool.category}/${tool.slug}`} className="contents">
          <ToolCard tool={tool} />
        </li>
      ))}
    </ul>
  );
}
