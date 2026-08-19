import { CategoryPage, categoryMetadata } from '@/components/layout/category_page';

export const metadata = categoryMetadata('video');

export default function Page() {
  return <CategoryPage id="video" />;
}
