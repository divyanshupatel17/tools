import { ToolUi } from './tool_ui';
import { Art } from '@/components/ui/art';
import { hasProcessor } from '@/lib/processing/processor_registry';
import { hasWorkspace } from '@/lib/processing/workspace_ids';
import type { Tool } from '@/lib/tools/tool_types';

/**
 * Shell every tool page renders. Until a tool ships a processor and a UI it shows a
 * coming-soon state — it never pretends to process anything.
 */
export function ToolWorkspace({ tool }: { tool: Tool }) {
  const ready =
    tool.status === 'available' && hasProcessor(tool.processor) && hasWorkspace(tool.processor);

  if (!ready) {
    return (
      <section className="rounded-card border-border bg-surface mx-auto flex max-w-2xl flex-col items-center gap-4 border px-6 py-12 text-center">
        <Art
          src="/images/mascot-round-glasses.webp"
          width={390}
          height={820}
          className="h-28 w-auto"
        />
        <h2 className="text-lg font-semibold">Coming soon</h2>
        <p className="text-muted max-w-md text-sm">
          {tool.name} is on the roadmap but is not built yet. Nothing here uploads or processes
          files.
        </p>
      </section>
    );
  }

  return (
    <section aria-label={`${tool.name} workspace`}>
      <ToolUi id={tool.processor} />
    </section>
  );
}
