import { getToolBySlug } from '@/lib/tools/registry';
import { logAnalyticsEvent } from './analytics';

/**
 * Every processor id is `${category}.${slug}` (see `lib/tools/registry.ts`'s `define()`),
 * so the category and slug are always recoverable from the id alone without a registry
 * lookup or touching each of the ~165 workspace call sites that already pass it.
 */
function splitProcessorId(processorId: string): { category: string; slug: string } {
  const [category = '', slug = ''] = processorId.split('.', 2);
  return { category, slug };
}

/** Fires once per `loadProcessor()` call, i.e. once per tool run attempt. */
export function logToolUsed(processorId: string): void {
  const { category, slug } = splitProcessorId(processorId);
  void logAnalyticsEvent('tool_used', {
    tool_id: processorId,
    tool_category: category,
    tool_slug: slug,
  });
}

/** Fires when a processor run rejects with anything other than a user initiated abort. */
export function logToolError(processorId: string, error: unknown): void {
  const { category, slug } = splitProcessorId(processorId);
  void logAnalyticsEvent('tool_error', {
    tool_id: processorId,
    tool_category: category,
    tool_slug: slug,
    error_name: error instanceof Error ? error.name : 'unknown',
  });
}

/**
 * `downloadBlob()` is the single choke point every tool's download button calls, but it
 * only receives a blob and a file name. Every tool page is served at a flat `/{slug}` URL
 * (see AGENTS.md "Tool URLs are flat"), so the current path reliably names the tool that
 * produced the download without threading an id through all ~88 call sites.
 */
export function logDownloadResult(): void {
  if (typeof window === 'undefined') return;
  const slug = window.location.pathname.replace(/^\/+/, '').split('/')[0];
  const tool = slug ? getToolBySlug(slug) : undefined;
  if (!tool) return;

  void logAnalyticsEvent('download_result', {
    tool_id: tool.processor,
    tool_category: tool.category,
    tool_slug: tool.slug,
  });
}
