import { TOOL_CATEGORIES } from '@/lib/tools/categories';
import { TOOLS } from '@/lib/tools/registry';

export interface SiteStat {
  label: string;
  value: string;
  /** lucide icon name resolved by `tool_icon.tsx`. */
  icon: string;
  accent: 'pdf' | 'image' | 'audio' | 'developer';
}

/** Every figure here is derived from the live registry. No visitor or usage counters:
 * this app has no analytics backend to source them from. */
export const SITE_STATS: readonly SiteStat[] = [
  {
    label: 'Total Tools',
    value: `${TOOLS.length}+`,
    icon: 'Wrench',
    accent: 'pdf',
  },
  {
    label: 'Categories',
    value: `${TOOL_CATEGORIES.length}`,
    icon: 'LayoutGrid',
    accent: 'image',
  },
  {
    label: 'Server Uploads',
    value: '0',
    icon: 'Shield',
    accent: 'audio',
  },
  {
    label: 'Cost to Use',
    value: 'Free',
    icon: 'CircleCheck',
    accent: 'developer',
  },
];
