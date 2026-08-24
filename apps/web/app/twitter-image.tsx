import { OG_IMAGE_SIZE, renderSiteOgImage } from '@/lib/seo/og_image';
import { SITE_NAME } from '@/lib/seo/site';

export const alt = SITE_NAME;
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return renderSiteOgImage();
}
