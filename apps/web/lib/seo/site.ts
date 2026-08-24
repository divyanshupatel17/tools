export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://toolhub.divyanshupatel.com'
).replace(/\/$/, '');

/** Must stay in sync with `basePath` in next.config.ts. Empty string means the app is
 * served at its domain's root; every link, asset and canonical URL derives from this one
 * constant, so changing where the app is hosted never means hunting for hardcoded paths. */
export const SITE_BASE_PATH = '';

export const SITE_URL = `${SITE_ORIGIN}${SITE_BASE_PATH}`;

export const SITE_NAME = 'ToolHub';

export const SITE_DESCRIPTION =
  'Free online tools that run in your browser. PDF, image, video, audio, text, developer and converter tools with no upload and no sign-up.';

/** Turns an app-relative route such as `/pdf/merge-pdf` into a full canonical URL. */
export function absoluteUrl(path = '/'): string {
  const suffix = path === '/' ? '' : path.replace(/\/$/, '');
  return `${SITE_URL}${suffix}`;
}
