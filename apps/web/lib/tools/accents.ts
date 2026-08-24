import type { Tool, ToolAccent } from './tool_types';

const ACCENT_VAR: Record<ToolAccent, string> = {
  pdf: 'var(--accent-pdf)',
  image: 'var(--accent-image)',
  video: 'var(--accent-video)',
  audio: 'var(--accent-audio)',
  text: 'var(--accent-text)',
  developer: 'var(--accent-developer)',
  converters: 'var(--accent-converters)',
  utilities: 'var(--accent-utilities)',
  ai: 'var(--accent-ai)',
  math: 'var(--accent-math)',
};

/** Icon tiles soften the accent colour rather than use a second hardcoded shade, so both themes stay in palette. */
export function accentStyle(accent: ToolAccent): React.CSSProperties {
  const colour = ACCENT_VAR[accent];
  return {
    color: colour,
    backgroundColor: `color-mix(in srgb, ${colour} var(--accent-tint), var(--tint-base))`,
  };
}

export function toolAccent(tool: Tool): ToolAccent {
  return tool.accent ?? tool.category;
}
