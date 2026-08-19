import { CategoryPage, categoryMetadata } from '@/components/layout/category_page';

export const metadata = categoryMetadata('image');

export default function Page() {
  return <CategoryPage id="image" />;
}
