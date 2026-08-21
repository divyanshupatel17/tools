import type { ToolProcessor } from '@tools/tool_engine';

// The Stopwatch runs entirely in local component state (nothing to upload or convert); this
// processor only exists to satisfy the registry's processor+workspace gate in `ToolWorkspace`.
const stopwatchProcessor: ToolProcessor = async () => ({ artifacts: [] });

export default stopwatchProcessor;
