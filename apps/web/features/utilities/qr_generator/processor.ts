import type { ToolProcessor } from '@tools/tool_engine';

// QR generation and download happen entirely in the workspace's own canvas/SVG rendering
// (nothing to upload or convert); this processor only exists to satisfy the registry's
// processor+workspace gate in `ToolWorkspace`.
const qrGeneratorProcessor: ToolProcessor = async () => ({ artifacts: [] });

export default qrGeneratorProcessor;
