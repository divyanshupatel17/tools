export type {
  ProcessorInput,
  ProcessorOutput,
  ProcessorArtifact,
  ProcessorContext,
  ToolProcessor,
} from '@tools/tool_engine';

export const TOOL_CATEGORY_IDS = [
  'pdf',
  'image',
  'video',
  'audio',
  'text',
  'developer',
  'converters',
  'utilities',
  'ai',
  'math',
] as const;

export type ToolCategoryId = (typeof TOOL_CATEGORY_IDS)[number];

/** Coarse media classes used to pick an upload widget and describe a tool in schema.org markup. */
export type ToolMediaType =
  'pdf' | 'image' | 'video' | 'audio' | 'text' | 'json' | 'archive' | 'document' | 'none';

export type ToolStatus = 'planned' | 'available';

/** Accents are the eight palette colours, named after the category each one belongs to. */
export type ToolAccent = ToolCategoryId;

export interface ToolSeo {
  title: string;
  description: string;
  keywords?: readonly string[];
}

export interface ToolCategory {
  id: ToolCategoryId;
  name: string;
  /** URL segment; equal to `id` today, kept separate so a rename never breaks the type. */
  slug: string;
  tagline: string;
  description: string;
  icon: string;
  seo: ToolSeo;
}

/** A named block of tools inside one category, e.g. "Organize PDF". */
export interface ToolSection {
  id: string;
  name: string;
  /** One line under the section header explaining what the block is for. */
  tagline: string;
}

export interface Tool {
  slug: string;
  category: ToolCategoryId;
  /** Section id within the category. Categories without sections leave it unset. */
  section?: string;
  name: string;
  description: string;
  /** lucide-react icon name, resolved at render time by `tool_icon.tsx`. */
  icon: string;
  /** Overrides the icon tile colour; defaults to the tool's own category accent. */
  accent?: ToolAccent;
  /** Stable id used to lazily load the implementation; unique across the registry. */
  processor: string;
  input_types: readonly ToolMediaType[];
  output_types: readonly ToolMediaType[];
  client_only: boolean;
  worker_required: boolean;
  multiple_files: boolean;
  popular: boolean;
  /** Order within the Popular Tools row; lower comes first. */
  popular_rank?: number;
  status: ToolStatus;
  seo: ToolSeo;
}

export function isToolCategoryId(value: string): value is ToolCategoryId {
  return (TOOL_CATEGORY_IDS as readonly string[]).includes(value);
}
