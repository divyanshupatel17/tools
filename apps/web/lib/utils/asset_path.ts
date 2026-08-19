import { SITE_BASE_PATH } from '@/lib/seo/site';

/** Next does not rewrite plain `src`/`fetch` strings, so public assets need the basePath. */
export function assetPath(path: string): string {
  return `${SITE_BASE_PATH}${path}`;
}
