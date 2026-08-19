import { CategoryPage, categoryMetadata } from '@/components/layout/category_page';

export const metadata = categoryMetadata('text');

export default function Page() {
  return <CategoryPage id="text" />;
}
