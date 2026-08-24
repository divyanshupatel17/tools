import { TOOLS } from '@/lib/tools/registry';

export interface SiteStat {
  label: string;
  value: string;
  /** lucide icon name resolved by `tool_icon.tsx`. */
  icon: string;
  accent: 'pdf' | 'image' | 'audio' | 'developer';
}

const inIndianDigits = (value: number) => value.toLocaleString('en-IN');

/** Only the tool count is real data; visitors, files processed and uptime are placeholders
 * until wired to analytics/uptime monitoring. */
export const PLACEHOLDER_VISITORS = 1_245_678;
export const PLACEHOLDER_FILES_PROCESSED = 9_876_543;
export const PLACEHOLDER_UPTIME = '99.9%';

export const SITE_STATS: readonly SiteStat[] = [
  {
    label: 'Total Visitors',
    value: inIndianDigits(PLACEHOLDER_VISITORS),
    icon: 'Users',
    accent: 'pdf',
  },
  {
    label: 'Total Files Processed',
    value: inIndianDigits(PLACEHOLDER_FILES_PROCESSED),
    icon: 'FileText',
    accent: 'image',
  },
  {
    label: 'Total Tools',
    value: `${TOOLS.length}+`,
    icon: 'Wrench',
    accent: 'audio',
  },
  {
    label: 'Uptime',
    value: PLACEHOLDER_UPTIME,
    icon: 'Shield',
    accent: 'developer',
  },
];
