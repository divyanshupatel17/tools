import { OG_IMAGE_SIZE, renderSiteOgImage } from '@/lib/seo/og_image';

export const alt = 'divyanshupatel.com/tools';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return renderSiteOgImage();
}
